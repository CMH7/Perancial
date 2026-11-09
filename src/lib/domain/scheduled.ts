// Scheduled Transactions: producing occurrences from a plan's versions, their paid status, and
// the edits a plan allows (ADR 0003). Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import type {
	OccurrenceChange,
	PlanVersion,
	RepeatRule,
	Scheduled,
	ScheduledDoc,
	Transaction
} from './schemas.ts';
import type { ChartWrite } from './writes.ts';

/** One due date a plan produces. `due` (the rule date) is its identity, even after a move. */
export type Occurrence = {
	planId: string;
	due: IsoDate;
	/** Where it falls now: the rule date, or where it was moved to. */
	date: IsoDate;
	version: PlanVersion;
	skipped: boolean;
	settled: boolean;
	/** Per line of the version, after any per-occurrence amounts; null still varies. */
	amounts: (number | null)[];
	/** The To side, fees included; null while any To amount varies. */
	total: number | null;
};

// Plain calendar arithmetic on `YYYY-MM-DD`, in UTC so no timezone shifts a day.
const parts = (d: IsoDate) => d.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) =>
	`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addDays(d: IsoDate, n: number): IsoDate {
	const [y, m, day] = parts(d);
	const t = new Date(Date.UTC(y, m - 1, day + n));
	return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** A rule's dates from its start through `until`, ascending. */
function* ruleDates(rule: RepeatRule, until: IsoDate): Generator<IsoDate> {
	if (rule.type === 'once') {
		if (rule.date <= until) yield rule.date;
		return;
	}
	const [sy, sm, sd] = parts(rule.start);
	if (rule.type === 'weekly') {
		for (let d = rule.start; d <= until; d = addDays(d, 7 * rule.every)) yield d;
		return;
	}
	if (rule.type === 'yearly') {
		for (let y = sy; ; y++) {
			const d = iso(y, sm, Math.min(sd, daysIn(y, sm)));
			if (d > until) return;
			yield d;
		}
	}
	for (let y = sy, m = sm; ; m === 12 ? ((m = 1), y++) : m++) {
		const last = daysIn(y, m);
		const days = rule.type === 'cutoff' ? [15, Math.min(30, last)] : [Math.min(rule.day, last)];
		for (const day of days) {
			const d = iso(y, m, day);
			if (d > until) return;
			if (d >= rule.start) yield d;
		}
	}
}

/** Far enough ahead to catch an occurrence moved back into the window. */
const MOVE_MARGIN_DAYS = 366;

/** Every occurrence whose current date falls in the window, in date order. */
export function occurrencesOf(
	plan: Scheduled,
	{ from, to }: { from: IsoDate; to: IsoDate }
): Occurrence[] {
	const until = addDays(to, MOVE_MARGIN_DAYS);
	const end = plan.end;
	const out: Occurrence[] = [];
	let produced = 0;

	versions: for (const [i, version] of plan.versions.entries()) {
		const next = plan.versions[i + 1]?.from;
		for (const due of ruleDates(version.rule, until)) {
			if (due < version.from) continue;
			if (next && due >= next) break;
			if (end.type === 'on' && due > end.date) break versions;
			if (end.type === 'after' && produced >= end.count) break versions;
			produced++;

			const change = plan.occurrences[due] ?? {};
			const date = change.movedTo ?? due;
			if (date < from || date > to) continue;
			const amounts = version.lines.map((l, k) =>
				change.amounts && change.amounts[k] !== undefined ? change.amounts[k] : l.amount
			);
			const toAmounts = version.lines.flatMap((l, k) => (l.side === 'to' ? [amounts[k]] : []));
			out.push({
				planId: plan.id,
				due,
				date,
				version,
				skipped: !!change.skipped,
				settled: !!change.settled,
				amounts,
				total: toAmounts.some((a) => a === null)
					? null
					: toAmounts.reduce<number>((s, a) => s + (a ?? 0), 0)
			});
		}
	}
	return out.sort((a, b) => a.date.localeCompare(b.date) || a.due.localeCompare(b.due));
}

export type OccurrenceStatus = {
	status: 'unpaid' | 'partly-paid' | 'paid' | 'skipped';
	/** Past its date and not paid or skipped. */
	overdue: boolean;
	/** What the paying Transactions add up to (their To side). */
	paid: number;
	/** What is left; null while the total varies. */
	remaining: number | null;
	payments: Transaction[];
};

const txTotal = (tx: Transaction) => tx.entries.reduce((s, e) => s + Math.max(e.amount, 0), 0);

/** Transactions whose paid link names this occurrence, oldest first. */
export function paymentsFor(chart: Chart, occ: Pick<Occurrence, 'planId' | 'due'>): Transaction[] {
	return chart
		.transactions()
		.filter(
			(tx) =>
				tx.pays?.plan === 'scheduled' && tx.pays.planId === occ.planId && tx.pays.due === occ.due
		)
		.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || +a.createdAt - +b.createdAt);
}

/**
 * Paid once its paying Transactions reach its total, or once "Mark paid" settles it after at
 * least one payment. Only Transactions pay: nothing is paid without one.
 */
export function occurrenceStatus(
	chart: Chart,
	occ: Occurrence,
	{ today }: { today: IsoDate }
): OccurrenceStatus {
	const payments = paymentsFor(chart, occ);
	const paid = payments.reduce((s, tx) => s + txTotal(tx), 0);
	const status: OccurrenceStatus['status'] = occ.skipped
		? 'skipped'
		: payments.length === 0
			? 'unpaid'
			: occ.settled || (occ.total !== null && paid >= occ.total)
				? 'paid'
				: 'partly-paid';
	const remaining =
		status === 'paid' || status === 'skipped'
			? 0
			: occ.total === null
				? null
				: Math.max(occ.total - paid, 0);
	return {
		status,
		overdue: (status === 'unpaid' || status === 'partly-paid') && occ.date < today,
		paid,
		remaining,
		payments
	};
}

/** The write that saves a plan with some fields changed. */
function save(plan: Scheduled, patch: Partial<ScheduledDoc>, now: Date): ChartWrite[] {
	const { id, ...data } = plan;
	return [{ op: 'setScheduled', id, data: { ...data, ...patch, updatedAt: now } }];
}

/** Whether the plan's rules produce an occurrence with this rule date. */
function producesDue(plan: Scheduled, due: IsoDate): boolean {
	return occurrencesOf({ ...plan, occurrences: {} }, { from: due, to: due }).some(
		(o) => o.due === due
	);
}

/**
 * "Only this occurrence": skip, move, change amounts, or Mark paid / unpaid. Mark paid needs at
 * least one paying Transaction.
 */
export function planChangeOccurrence(
	chart: Chart,
	plan: Scheduled,
	due: IsoDate,
	change: OccurrenceChange,
	{ now }: { now: Date }
): ChartWrite[] {
	if (!producesDue(plan, due)) throw new Error(`${due} is not an occurrence of this plan`);
	if (change.settled && paymentsFor(chart, { planId: plan.id, due }).length === 0)
		throw new Error('Record or link a paying Transaction first');
	const merged: OccurrenceChange = { ...plan.occurrences[due], ...change };
	if (merged.movedTo === due) delete merged.movedTo;
	for (const key of Object.keys(merged) as (keyof OccurrenceChange)[])
		if (merged[key] === undefined || merged[key] === false) delete merged[key];
	const occurrences = { ...plan.occurrences };
	if (Object.keys(merged).length) occurrences[due] = merged;
	else delete occurrences[due];
	return save(plan, { occurrences }, now);
}

/**
 * "This and all following": a new version from this occurrence's rule date. Versions starting
 * later are dropped, and so are per-occurrence changes from that date on (`replaced` counts them).
 */
export function planChangeFollowing(
	plan: Scheduled,
	due: IsoDate,
	values: Omit<PlanVersion, 'from'>,
	{ now }: { now: Date }
): { writes: ChartWrite[]; replaced: number } {
	if (!producesDue(plan, due)) throw new Error(`${due} is not an occurrence of this plan`);
	const versions = [...plan.versions.filter((v) => v.from < due), { ...values, from: due }];
	const kept = Object.entries(plan.occurrences).filter(([d]) => d < due);
	return {
		writes: save(plan, { versions, occurrences: Object.fromEntries(kept) }, now),
		replaced: Object.keys(plan.occurrences).length - kept.length
	};
}

/** From the Plans list: new details on every version. Rules change only from an occurrence. */
export function planChangeAll(
	plan: Scheduled,
	details: Pick<PlanVersion, 'description' | 'note' | 'tags' | 'lines'>,
	{ now }: { now: Date }
): ChartWrite[] {
	return save(plan, { versions: plan.versions.map((v) => ({ ...v, ...details })) }, now);
}

/** Ends a plan today, keeping its history and paid links. */
export function planEndPlan(
	plan: Scheduled,
	{ today, now }: { today: IsoDate; now: Date }
): ChartWrite[] {
	const end =
		plan.end.type === 'on' && plan.end.date < today
			? plan.end
			: { type: 'on' as const, date: today };
	return save(plan, { end }, now);
}

/** Deleting is only for a plan nothing has paid yet; otherwise it is ended. */
export function planDeletePlan(chart: Chart, planId: string): ChartWrite[] {
	const paid = chart
		.transactions()
		.some((tx) => tx.pays?.plan === 'scheduled' && tx.pays.planId === planId);
	if (paid)
		throw new Error(
			'Transactions pay this plan, so deleting it would break their links. End it instead.'
		);
	return [{ op: 'deleteScheduled', id: planId }];
}

/**
 * "Mark paid" settles the payments made so far. When the last paying Transaction of an occurrence
 * is unlinked or deleted, the mark goes too, so a later payment starts from partly paid again.
 */
export function clearSettledWithLastPayment(
	chart: Chart,
	tx: Transaction,
	plans: Scheduled[],
	now: Date
): ChartWrite[] {
	const link = tx.pays;
	if (link?.plan !== 'scheduled') return [];
	const plan = plans.find((p) => p.id === link.planId);
	const change = plan?.occurrences[link.due];
	if (!plan || !change?.settled) return [];
	const others = paymentsFor(chart, { planId: plan.id, due: link.due }).filter(
		(p) => p.id !== tx.id
	);
	if (others.length) return [];
	const { settled: _settled, ...rest } = change;
	const occurrences = { ...plan.occurrences };
	if (Object.keys(rest).length) occurrences[link.due] = rest;
	else delete occurrences[link.due];
	return save(plan, { occurrences }, now);
}
