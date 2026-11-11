// What the Scheduled screen shows (Upcoming, a plan's history, its next date) and the plan editor's
// checks and writes. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import { expectedStatus } from './forecast.ts';
import { parseAmount } from './money.ts';
import {
	PlanEnd,
	RepeatRule,
	type Installment,
	type PlanLine,
	type PlanVersion,
	type Scheduled
} from './schemas.ts';
import { addDays, occurrencesOf, type Occurrence, type OccurrenceStatus } from './scheduled.ts';
import {
	lineAccountErrors,
	normalizeTags,
	type DraftError,
	type DraftFee,
	type DraftLine
} from './transactions.ts';
import type { ChartWrite } from './writes.ts';

export type OccurrenceView = { plan: Scheduled; occurrence: Occurrence; status: OccurrenceStatus };

const EARLIEST = '1900-01-01';
export const UPCOMING_DAYS = 30;

/** Overdue occurrences first (oldest first), then those due in the next 30 days. */
export function upcoming(
	chart: Chart,
	plans: Scheduled[],
	{ today, installments = [] }: { today: IsoDate; installments?: Installment[] }
): OccurrenceView[] {
	const until = addDays(today, UPCOMING_DAYS);
	const input = { chart, scheduled: plans, installments };
	const views = plans.flatMap((plan) =>
		occurrencesOf(plan, { from: EARLIEST, to: until })
			.map((occurrence) => ({
				plan,
				occurrence,
				status: expectedStatus(input, plan, occurrence, { today }).status
			}))
			.filter(({ occurrence, status }) =>
				status.status === 'paid' || status.status === 'skipped'
					? false
					: status.overdue || occurrence.date >= today
			)
	);
	return views.sort(
		(a, b) =>
			Number(b.status.overdue) - Number(a.status.overdue) ||
			a.occurrence.date.localeCompare(b.occurrence.date) ||
			a.plan.id.localeCompare(b.plan.id)
	);
}

/** Past occurrences, plus any already paid ahead of time, newest first. */
export function planHistory(
	chart: Chart,
	plan: Scheduled,
	{
		today,
		scheduled = [plan],
		installments = []
	}: { today: IsoDate; scheduled?: Scheduled[]; installments?: Installment[] }
): OccurrenceView[] {
	const input = { chart, scheduled, installments };
	return occurrencesOf(plan, { from: EARLIEST, to: addDays(today, 3660) })
		.map((occurrence) => ({
			plan,
			occurrence,
			status: expectedStatus(input, plan, occurrence, { today }).status
		}))
		.filter(({ occurrence, status }) => occurrence.date < today || status.status === 'paid')
		.reverse();
}

/** The first occurrence from today on that isn't skipped; none once the plan has ended. */
export function nextOccurrence(
	plan: Scheduled,
	{ today }: { today: IsoDate }
): Occurrence | undefined {
	return occurrencesOf(plan, { from: today, to: addDays(today, 3660) }).find((o) => !o.skipped);
}

/** What the plan editor holds: the Transaction form's fields plus the repeat rule and end. */
export type PlanDraft = {
	description: string;
	note: string;
	tags: string[];
	from: DraftLine[];
	to: DraftLine[];
	fees: DraftFee[];
	rule: RepeatRule;
	end: PlanEnd;
	/** The owner's Forecast Section; none (or null) means the derived default. */
	section?: string | null;
};

/** Where the rule starts: its start date, or the date of a one-off. */
export const ruleStart = (rule: RepeatRule) => (rule.type === 'once' ? rule.date : rule.start);

/**
 * The plan editor's checks. Like the Transaction form, except that any amount may be blank
 * ("varies"); From and To must match only once every amount is filled.
 */
export function evaluatePlanDraft(
	chart: Chart,
	draft: PlanDraft,
	{ kept }: { kept?: ReadonlySet<string> } = {}
): { errors: DraftError[]; lines: PlanLine[] } {
	const errors: DraftError[] = [];
	const fail = (at: string, message: string) => errors.push({ at, message });
	const amount = (line: DraftLine, at: string): number | null => {
		if (line.amount.trim() === '') return null;
		const cents = parseAmount(line.amount);
		if (cents === null || cents <= 0) {
			fail(at, 'Enter an amount above zero, or leave it blank when it varies');
			return null;
		}
		return cents;
	};
	const lines: PlanLine[] = [
		...draft.from.map((l, i) => ({
			accountId: l.accountId,
			side: 'from' as const,
			amount: amount(l, `from.${i}.amount`)
		})),
		...draft.to.map((l, i) => ({
			accountId: l.accountId,
			side: 'to' as const,
			amount: amount(l, `to.${i}.amount`)
		})),
		...draft.fees.map((l, i) => ({
			accountId: l.accountId,
			side: 'to' as const,
			amount: amount(l, `fees.${i}.amount`),
			fee: l.mode
		}))
	];
	const filled = lines.every((l) => l.amount !== null);
	const sum = (side: 'from' | 'to') =>
		lines.filter((l) => l.side === side).reduce((s, l) => s + (l.amount ?? 0), 0);
	if (filled && !errors.length && sum('from') !== sum('to'))
		fail('total', 'From and To must add up to the same amount, or leave one blank');

	errors.push(...lineAccountErrors(chart, draft, kept));

	const description = draft.description.trim();
	if (!description) fail('description', 'Add a Description');
	else if (description.length > 200) fail('description', 'At most 200 characters');
	if (draft.note.length > 5000) fail('note', 'At most 5,000 characters');
	if (!RepeatRule.safeParse(draft.rule).success) fail('rule', 'Complete the repeat rule');
	if (!PlanEnd.safeParse(draft.end).success) fail('end', 'Complete when the plan ends');
	else if (
		draft.end.type === 'on' &&
		RepeatRule.safeParse(draft.rule).success &&
		draft.end.date < ruleStart(draft.rule)
	)
		fail('end', 'The plan would end before it starts');
	return { errors, lines };
}

/** A version's values from the editor (its `from` is set by the caller). Throws on errors. */
export function versionFromDraft(
	chart: Chart,
	draft: PlanDraft,
	kept?: ReadonlySet<string>
): Omit<PlanVersion, 'from'> {
	const { errors, lines } = evaluatePlanDraft(chart, draft, { kept });
	if (errors.length) throw new Error(errors[0].message);
	return {
		description: draft.description.trim(),
		note: draft.note,
		tags: normalizeTags(draft.tags),
		lines,
		rule: draft.rule
	};
}

/** The write for a new plan: one version starting where its rule starts. */
export function planCreatePlan(
	chart: Chart,
	draft: PlanDraft,
	{ id, now }: { id: string; now: Date }
): ChartWrite[] {
	const version = versionFromDraft(chart, draft);
	return [
		{
			op: 'setScheduled',
			id,
			data: {
				versions: [{ from: ruleStart(draft.rule), ...version }],
				end: draft.end,
				occurrences: {},
				...(draft.section ? { section: draft.section } : {}),
				createdAt: now,
				updatedAt: now
			}
		}
	];
}

const amountText = (cents: number | null) =>
	cents === null ? '' : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** The editor filled from the version in force on `date` (the latest version without one). */
export function planDraftFrom(plan: Scheduled, date?: IsoDate): PlanDraft {
	const version =
		(date ? plan.versions.findLast((v) => v.from <= date) : undefined) ?? plan.versions.at(-1)!;
	const line = (l: PlanLine): DraftLine => ({
		accountId: l.accountId,
		amount: amountText(l.amount)
	});
	return {
		description: version.description,
		note: version.note,
		tags: [...version.tags],
		from: version.lines.filter((l) => l.side === 'from').map(line),
		to: version.lines.filter((l) => l.side === 'to' && !l.fee).map(line),
		fees: version.lines.filter((l) => l.fee).map((l) => ({ ...line(l), mode: l.fee! })),
		rule: version.rule,
		end: plan.end,
		...(plan.section ? { section: plan.section } : {})
	};
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ordinal = (n: number) =>
	`${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** `2026-12-01` as `1 Dec 2026`. */
export function shortDate(d: IsoDate, { year = true } = {}): string {
	const [y, m, day] = d.split('-').map(Number);
	return `${day} ${MONTHS[m - 1]}${year ? ` ${y}` : ''}`;
}

/** A repeat rule in words, for lists and headers. */
export function describeRule(rule: RepeatRule): string {
	switch (rule.type) {
		case 'once':
			return `Once, on ${shortDate(rule.date)}`;
		case 'cutoff':
			return 'Every cut-off (15th and 30th)';
		case 'monthly':
			return `Monthly on the ${ordinal(rule.day)}${rule.day > 28 ? ' (or the last day)' : ''}`;
		case 'weekly': {
			const [y, m, d] = rule.start.split('-').map(Number);
			const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
			return `${rule.every === 1 ? 'Every week' : `Every ${rule.every} weeks`} on ${weekday}`;
		}
		case 'yearly':
			return `Yearly on ${shortDate(rule.start, { year: false })}`;
	}
}
