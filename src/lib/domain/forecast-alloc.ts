// Early allocation (GLOSSARY): moving money into a reserve during an earlier Cut-off for a
// specific Outflow a later Cut-off funds. A one-time transfer plan carries `allocates` (the
// paid-link shape); the target is then paid from the reserve. Pure TypeScript, no Firebase.
import type { IsoDate } from './chart.ts';
import {
	buildForecast,
	fundingAccountsFor,
	fundingCutoffOf,
	nextCutoff,
	type ForecastInput,
	type ForecastOutflow,
	type OutflowLink
} from './forecast.ts';
import { formatAmount } from './money.ts';
import { planHasPayments } from './payable.ts';
import { statementId, type Installment, type PayingSource, type Scheduled } from './schemas.ts';
import type { ChartWrite } from './writes.ts';

const keyOf = (l: OutflowLink) => `${l.plan}:${l.planId}:${l.due}`;

/** The next Cut-offs after this one, to allocate early for. */
export function upcomingCutoffs(cutoff: IsoDate, count = 12): IsoDate[] {
	const out: IsoDate[] = [];
	for (let c = nextCutoff(cutoff); out.length < count; c = nextCutoff(c)) out.push(c);
	return out;
}

/**
 * Outflows of a later Cut-off (the next one by default) that can be allocated early from this
 * one: open, not already allocated, not themselves an allocation, with something left to pay.
 */
export function allocationCandidates(
	input: ForecastInput,
	cutoff: IsoDate,
	{ target = nextCutoff(cutoff) }: { target?: IsoDate } = {}
): ForecastOutflow[] {
	if (target <= cutoff) return [];
	return buildForecast(input, target).outflows.filter(
		(o) =>
			o.carried === undefined &&
			(o.status === 'unpaid' || o.status === 'partly-paid') &&
			!o.allocatedIn &&
			!o.ealloc &&
			o.remaining > 0
	);
}

/** The reserve the latest Early allocation moved money into, to pick it again. */
export function lastReserve(scheduled: Scheduled[]): string | null {
	const latest = scheduled
		.filter((p) => p.allocates)
		.sort((a, b) => +b.createdAt - +a.createdAt)[0];
	return latest?.versions[0].lines.find((l) => l.side === 'to')?.accountId ?? null;
}

const isAssetLeaf = (input: ForecastInput, id: string) =>
	input.chart.account(id)?.type === 'asset' && !input.chart.isGroup(id);

/**
 * Writes the target's Paying sources on its Occurrence, Row or Statement (undefined = the
 * defaults again).
 */
function setTargetSources(
	input: ForecastInput,
	link: OutflowLink,
	sources: PayingSource[] | undefined,
	now: Date
): ChartWrite {
	if (link.plan === 'statement') {
		const prior = (input.statements ?? []).find(
			(s) => s.cardId === link.planId && s.statementDate === link.due
		);
		return {
			op: 'setStatement',
			id: statementId(link.planId, link.due),
			data: {
				amount: prior?.amount ?? null,
				sources: sources ?? [],
				createdAt: prior?.createdAt ?? now,
				updatedAt: now
			}
		};
	}
	if (link.plan === 'scheduled') {
		const plan = input.scheduled.find((p) => p.id === link.planId);
		if (!plan) throw new Error('The Outflow’s plan no longer exists');
		const { id, ...data } = plan;
		const occurrences = { ...data.occurrences };
		const { sources: _old, ...rest } = occurrences[link.due] ?? {};
		const change = sources ? { ...rest, sources } : rest;
		if (Object.keys(change).length) occurrences[link.due] = change;
		else delete occurrences[link.due];
		return { op: 'setScheduled', id, data: { ...data, occurrences, updatedAt: now } };
	}
	const plan = input.installments.find((p) => p.id === link.planId);
	if (!plan) throw new Error('The Outflow’s plan no longer exists');
	const { id, ...data } = plan as Installment;
	const i = data.rows.findIndex((r) => r.due === link.due);
	if (i < 0) throw new Error('That row is no longer in this plan');
	const { sources: _old, ...row } = data.rows[i];
	const rows = data.rows.with(i, sources ? { ...row, sources } : row);
	return { op: 'setInstallment', id, data: { ...data, rows, updatedAt: now } };
}

/**
 * Allocates one later Outflow early: a one-time transfer from a Funding Account of this Cut-off
 * into the reserve, dated on the Cut-off date (or today, when later); the target is then paid from the
 * reserve, which joins the target Cut-off's Funding Accounts.
 */
export function planAllocateEarly(
	input: ForecastInput,
	{
		cutoff,
		target,
		reserveId,
		fromId,
		from: split,
		transferId,
		now
	}: {
		cutoff: IsoDate;
		target: Pick<ForecastOutflow, 'link' | 'label' | 'remaining' | 'sources' | 'date'>;
		reserveId: string;
		/** One Account paying the whole Outflow... */
		fromId?: string;
		/** ...or several, with what each pays; together they pay what is left. */
		from?: PayingSource[];
		transferId: string;
		now: Date;
	}
): ChartWrite[] {
	if (!isAssetLeaf(input, reserveId)) throw new Error('The reserve must be an Asset Leaf Account');
	if (target.remaining <= 0) throw new Error('Nothing is left to pay on that Outflow');
	const from = split ?? (fromId ? [{ accountId: fromId, amount: target.remaining }] : []);
	if (!from.length) throw new Error('Pick an Account to pay from');
	const funding = fundingAccountsFor(input, cutoff).ids;
	for (const f of from) {
		if (!funding.includes(f.accountId))
			throw new Error("Pay from one of this Cut-off's Funding Accounts");
		if (f.accountId === reserveId) throw new Error('Move the money into a different Account');
	}
	if (from.reduce((s, f) => s + f.amount, 0) !== target.remaining)
		throw new Error('The Pay-from amounts must add up to what is left on the Outflow');
	const link = target.link;
	if (input.scheduled.some((p) => p.allocates && keyOf(p.allocates) === keyOf(link)))
		throw new Error('That Outflow is already allocated');

	// The day this Cut-off's pay lands, or today when that has passed.
	const date = cutoff < input.today ? input.today : cutoff;
	const amount = target.remaining;
	const transfer: ChartWrite = {
		op: 'setScheduled',
		id: transferId,
		data: {
			versions: [
				{
					from: date,
					description: `Reserve for ${target.label}`,
					note: '',
					tags: [],
					lines: [
						...from.map((f) => ({
							accountId: f.accountId,
							side: 'from' as const,
							amount: f.amount
						})),
						{ accountId: reserveId, side: 'to', amount }
					],
					rule: { type: 'once', date }
				}
			],
			end: { type: 'never' },
			occurrences: {},
			allocates: link,
			createdAt: now,
			updatedAt: now
		}
	};

	// Whatever was paid already stays with its source; the rest comes from the reserve.
	const paid = target.sources
		.filter((s) => s.paid > 0 && s.accountId !== reserveId)
		.map((s) => ({ accountId: s.accountId, amount: s.paid }));
	const sources = [...paid, { accountId: reserveId, amount }];

	const writes: ChartWrite[] = [transfer, setTargetSources(input, link, sources, now)];
	// A Statement is identified by its Statement Date but paid by its Due Date.
	const targetCutoff = fundingCutoffOf(link.plan === 'statement' ? target.date : link.due);
	const targetFunding = fundingAccountsFor(input, targetCutoff).ids;
	if (!targetFunding.includes(reserveId)) {
		const existing = input.forecasts.find((f) => f.id === targetCutoff);
		writes.push({
			op: 'setForecast',
			id: targetCutoff,
			data: {
				fundingAccounts: [...targetFunding, reserveId],
				...(existing?.outflowOrder ? { outflowOrder: existing.outflowOrder } : {}),
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			}
		});
	}
	return writes;
}

/** The input with these writes applied, so a later pick sees what an earlier one changed. */
function withWrites(input: ForecastInput, writes: ChartWrite[]): ForecastInput {
	let { scheduled, installments, forecasts } = input;
	let statements = input.statements ?? [];
	for (const w of writes) {
		if (w.op === 'setScheduled')
			scheduled = [...scheduled.filter((p) => p.id !== w.id), { id: w.id, ...w.data }];
		else if (w.op === 'setInstallment')
			installments = [...installments.filter((p) => p.id !== w.id), { id: w.id, ...w.data }];
		else if (w.op === 'setForecast')
			forecasts = [...forecasts.filter((f) => f.id !== w.id), { id: w.id, ...w.data }];
		else if (w.op === 'setStatement') {
			// The id is `{cardId}_{statementDate}`: the date is its last 10 characters.
			const doc = {
				id: w.id,
				cardId: w.id.slice(0, -11),
				statementDate: w.id.slice(-10),
				...w.data
			};
			statements = [...statements.filter((d) => d.id !== w.id), doc];
		}
	}
	return { ...input, scheduled, installments, forecasts, statements };
}

/**
 * Allocates several Outflows early from several Accounts: each pick gets its own transfer, paid
 * from the Accounts in order (one may leave its amount blank to take the rest). The amounts must
 * add up to what the picks have left. A document two picks change is written once, with both.
 */
export function planAllocateMany(
	input: ForecastInput,
	{
		cutoff,
		targets,
		from,
		reserveId,
		newId,
		now
	}: {
		cutoff: IsoDate;
		targets: Pick<ForecastOutflow, 'key' | 'link' | 'label' | 'remaining' | 'sources' | 'date'>[];
		from: { accountId: string; amount: number | null }[];
		reserveId: string;
		newId: () => string;
		now: Date;
	}
): ChartWrite[] {
	if (!targets.length) throw new Error('Pick an Outflow to allocate');
	if (!from.length) throw new Error('Pick an Account to pay from');
	if (from.filter((f) => f.amount === null).length > 1)
		throw new Error('Leave at most one Pay-from amount blank');
	const need = targets.reduce((s, t) => s + t.remaining, 0);
	const fixed = from.reduce((s, f) => s + (f.amount ?? 0), 0);
	const amounts = from.map((f) => ({ accountId: f.accountId, amount: f.amount ?? need - fixed }));
	if (amounts.reduce((s, a) => s + a.amount, 0) !== need || amounts.some((a) => a.amount <= 0))
		throw new Error(
			`The Pay-from amounts add up to ${formatAmount(fixed)}; the picks need ${formatAmount(need)}`
		);

	const queue = amounts.map((a) => ({ ...a }));
	let state = input;
	const all: ChartWrite[] = [];
	for (const target of targets) {
		const lines: PayingSource[] = [];
		let left = target.remaining;
		while (left > 0) {
			const head = queue[0];
			const take = Math.min(head.amount, left);
			const same = lines.find((l) => l.accountId === head.accountId);
			if (same) same.amount += take;
			else lines.push({ accountId: head.accountId, amount: take });
			head.amount -= take;
			left -= take;
			if (head.amount === 0) queue.shift();
		}
		const writes = planAllocateEarly(state, {
			cutoff,
			target,
			reserveId,
			from: lines,
			transferId: newId(),
			now
		});
		state = withWrites(state, writes);
		all.push(...writes);
	}
	// One write per document: the last, which carries every pick's change.
	const last = new Map(all.map((w) => [`${w.op}:${w.id}`, w]));
	const seen = new Set<string>();
	return all.flatMap((w) => {
		const k = `${w.op}:${w.id}`;
		if (seen.has(k)) return [];
		seen.add(k);
		return [last.get(k)!];
	});
}

/**
 * Undo: deletes the transfer and gives the target back its plan's default sources. Refused once
 * a Transaction pays the transfer (the money has moved; move it back with a normal transfer).
 */
export function planUndoAllocation(
	input: ForecastInput,
	transfer: Scheduled,
	now: Date
): ChartWrite[] {
	if (!transfer.allocates) throw new Error('This is not an Early allocation');
	if (planHasPayments(input.chart, 'scheduled', transfer.id))
		throw new Error('The money has moved already. Move it back with a normal transfer instead.');
	const writes: ChartWrite[] = [{ op: 'deleteScheduled', id: transfer.id }];
	try {
		writes.push(setTargetSources(input, transfer.allocates, undefined, now));
	} catch {
		// The target's plan is gone; deleting the transfer is all that is left to do.
	}
	return writes;
}

/**
 * Resizes an Early allocation to what its Outflow now costs (a Statement's entered amount, a late
 * charge): the transfer and the reserve source both change by the gap. Refused once the money has
 * moved; move the difference with a normal transfer instead.
 */
export function planResizeAllocation(
	input: ForecastInput,
	target: Pick<ForecastOutflow, 'key' | 'link' | 'sources' | 'allocationGap'>,
	now: Date
): ChartWrite[] {
	const transfer = input.scheduled.find((p) => p.allocates && keyOf(p.allocates) === target.key);
	if (!transfer) throw new Error('That Outflow is not allocated early');
	const gap = target.allocationGap ?? 0;
	if (gap === 0) throw new Error('The reserve already matches the Outflow');
	if (planHasPayments(input.chart, 'scheduled', transfer.id))
		throw new Error('The money has moved already. Move the difference with a normal transfer.');
	const { id, ...data } = transfer;
	const [version, ...later] = data.versions;
	const reserveId = version.lines.find((l) => l.side === 'to')?.accountId;
	const amount = (version.lines.find((l) => l.side === 'to')?.amount ?? 0) + gap;
	if (!reserveId || amount <= 0)
		throw new Error('Nothing is left to set aside; undo the allocation instead');
	const lines = version.lines.map((l) => ({ ...l, amount }));
	const sources = target.sources.map((s) => ({
		accountId: s.accountId,
		amount: s.accountId === reserveId ? s.amount + gap : s.amount
	}));
	return [
		{
			op: 'setScheduled',
			id,
			data: { ...data, versions: [{ ...version, lines }, ...later], updatedAt: now }
		},
		setTargetSources(input, target.link, sources, now)
	];
}
