// Finding a plan on the Scheduled screen: search, filters, sort and grouping for the Plans tab,
// and the same search and filters for Upcoming. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import type { PlanVersion, RepeatRule, Scheduled } from './schemas.ts';
import type { Occurrence } from './scheduled.ts';
import { nextOccurrence, type OccurrenceView } from './scheduled-views.ts';
import { kindOf, type TransactionKind } from './transactions.ts';

export type PlanFilters = {
	/** Search over Description, Note, tags and Account names. */
	q: string;
	/** Active plans have a next Occurrence; ended ones don't. */
	show: 'active' | 'ended' | 'all';
	kind: TransactionKind | '';
	/** A Leaf or Group Account; a Group covers every Account under it. */
	accountId: string;
	tag: string;
};

export const noPlanFilters = (): PlanFilters => ({
	q: '',
	show: 'active',
	kind: '',
	accountId: '',
	tag: ''
});

/** The kind a plan's Transactions will have, from its lines' sides (amounts don't matter). */
export const planKind = (chart: Chart, v: PlanVersion): TransactionKind =>
	kindOf(
		chart,
		v.lines.map((l) => ({ accountId: l.accountId, amount: l.side === 'to' ? 1 : -1 }))
	);

export type PlanRow = {
	plan: Scheduled;
	/** The next Occurrence; none once the plan has ended. */
	next: Occurrence | undefined;
	/** What each Occurrence moves under the latest version; null when it varies. */
	amount: number | null;
	kind: TransactionKind;
};

const latest = (plan: Scheduled) => plan.versions.at(-1)!;
const description = (plan: Scheduled) => latest(plan).description;

/** Whether a plan version passes the search and filters shared by both tabs. */
function matches(chart: Chart, v: PlanVersion, f: PlanFilters): boolean {
	// Tags show with a leading #, so a search may include it.
	const q = f.q.trim().toLowerCase().replace(/^#/, '');
	const name = (id: string) => chart.account(id)?.name ?? '';
	const within = f.accountId ? new Set(chart.subtree(f.accountId).map((a) => a.id)) : null;
	return (
		(!f.kind || planKind(chart, v) === f.kind) &&
		(!within || v.lines.some((l) => within.has(l.accountId))) &&
		(!f.tag || v.tags.includes(f.tag)) &&
		(!q ||
			[v.description, v.note, ...v.tags, ...v.lines.map((l) => name(l.accountId))]
				.join('\n')
				.toLowerCase()
				.includes(q))
	);
}

/** The amount each Occurrence moves (its To side), or null when any line varies. */
export function planAmount(v: PlanVersion): number | null {
	const to = v.lines.filter((l) => l.side === 'to');
	return to.some((l) => l.amount === null) ? null : to.reduce((s, l) => s + l.amount!, 0);
}

export type PlanSort = 'next' | 'description' | 'amount';

const byDescription = (a: PlanRow, b: PlanRow) =>
	description(a.plan).localeCompare(description(b.plan));
const SORTS: Record<PlanSort, (a: PlanRow, b: PlanRow) => number> = {
	next: (a, b) =>
		(a.next?.date ?? '9999').localeCompare(b.next?.date ?? '9999') || byDescription(a, b),
	description: byDescription,
	amount: (a, b) => (b.amount ?? -1) - (a.amount ?? -1) || byDescription(a, b)
};

/** The Plans tab's rows, filtered and sorted (by next date unless told otherwise). */
export function planRows(
	chart: Chart,
	plans: Scheduled[],
	f: PlanFilters,
	{ today, sort = 'next' }: { today: IsoDate; sort?: PlanSort }
): PlanRow[] {
	return plans
		.filter((plan) => matches(chart, latest(plan), f))
		.map((plan) => ({
			plan,
			next: nextOccurrence(plan, { today }),
			amount: planAmount(latest(plan)),
			kind: planKind(chart, latest(plan))
		}))
		.filter(({ next }) => f.show === 'all' || (f.show === 'active') === !!next)
		.sort(SORTS[sort]);
}

export type PlanGroup = 'none' | 'kind' | 'repeat' | 'tag';

/** Repeat rule types in the order the Plans tab groups them, with their group headings. */
export const REPEAT_GROUPS: Record<RepeatRule['type'], string> = {
	cutoff: 'Every cut-off',
	weekly: 'Weekly',
	monthly: 'Monthly',
	yearly: 'Yearly',
	once: 'Once'
};
const KIND_ORDER: TransactionKind[] = ['expense', 'income', 'transfer', 'income-and-expense'];

/**
 * Rows split into groups, each keeping the rows' order. Groups come in a fixed order (tags A–Z,
 * untagged last, under the key ''); a plan with several tags is in each. Empty groups are left out.
 */
export function groupPlans(rows: PlanRow[], by: PlanGroup): { key: string; rows: PlanRow[] }[] {
	const keysOf = (r: PlanRow): string[] => {
		const v = latest(r.plan);
		if (by === 'kind') return [r.kind];
		if (by === 'repeat') return [v.rule.type];
		if (by === 'tag') return v.tags.length ? v.tags : [''];
		return [''];
	};
	const order =
		by === 'kind'
			? KIND_ORDER
			: by === 'repeat'
				? Object.keys(REPEAT_GROUPS)
				: [...new Set(rows.flatMap(keysOf))].sort((a, b) =>
						a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)
					);
	return order
		.map((key) => ({ key, rows: rows.filter((r) => keysOf(r).includes(key)) }))
		.filter((g) => g.rows.length);
}

/** Upcoming with the same search and filters, each Occurrence judged by its own version. */
export function filterUpcoming(
	chart: Chart,
	views: OccurrenceView[],
	f: PlanFilters
): OccurrenceView[] {
	return views.filter((v) => matches(chart, v.occurrence.version, f));
}
