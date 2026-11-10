// The Journal: every Transaction with filters and search, one-line summaries, and the one-click
// cleared / pending toggle. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import type { Transaction } from './schemas.ts';
import { kindOf, type TransactionKind } from './transactions.ts';
import type { ChartWrite } from './writes.ts';

export type JournalFilters = {
	/** Search over Description, Note, tags and Account names. */
	q: string;
	from: IsoDate | '';
	to: IsoDate | '';
	/** A Leaf or Group Account; a Group covers every Account under it. */
	accountId: string;
	kind: TransactionKind | '';
	status: Transaction['status'] | '';
	tag: string;
};

export const noFilters = (): JournalFilters => ({
	q: '',
	from: '',
	to: '',
	accountId: '',
	kind: '',
	status: '',
	tag: ''
});

/** Newest first; on the same date, the one entered later first. */
const newestFirst = (a: Transaction, b: Transaction) =>
	(b.date ?? '').localeCompare(a.date ?? '') || +b.createdAt - +a.createdAt;

/** The Journal's rows: every Transaction except Opening Balances, filtered and searched. */
export function journal(chart: Chart, f: JournalFilters): Transaction[] {
	const q = f.q.trim().toLowerCase();
	const within = f.accountId ? new Set(chart.subtree(f.accountId).map((a) => a.id)) : null;
	const name = (id: string) => chart.account(id)?.name ?? '';
	return chart
		.transactions()
		.filter((tx) => tx.origin === 'normal')
		.filter((tx) => !f.from || tx.date! >= f.from)
		.filter((tx) => !f.to || tx.date! <= f.to)
		.filter((tx) => !within || tx.entries.some((e) => within.has(e.accountId)))
		.filter((tx) => !f.kind || kindOf(chart, tx.entries) === f.kind)
		.filter((tx) => !f.status || tx.status === f.status)
		.filter((tx) => !f.tag || tx.tags.includes(f.tag))
		.filter(
			(tx) =>
				!q ||
				[tx.description, tx.note, ...tx.tags, ...tx.entries.map((e) => name(e.accountId))]
					.join('\n')
					.toLowerCase()
					.includes(q)
		)
		.sort(newestFirst);
}

export type JournalRow = {
	from: string[];
	to: string[];
	/** What moved: the sum of the To side, fees included. */
	total: number;
	kind: TransactionKind;
	pending: boolean;
};

export function journalRow(chart: Chart, tx: Transaction): JournalRow {
	const name = (id: string) => chart.account(id)?.name ?? '(deleted Account)';
	return {
		from: tx.entries.filter((e) => e.amount < 0).map((e) => name(e.accountId)),
		to: tx.entries.filter((e) => e.amount > 0).map((e) => name(e.accountId)),
		total: tx.entries.reduce((s, e) => s + Math.max(e.amount, 0), 0),
		kind: kindOf(chart, tx.entries),
		pending: tx.status === 'pending'
	};
}

/** One-click cleared / pending: rewrites only the status. Nothing to write when it is already set. */
export function planSetStatus(
	chart: Chart,
	id: string,
	status: Transaction['status'],
	{ now }: { now: Date }
): ChartWrite[] {
	const tx = chart.transaction(id);
	if (!tx) throw new Error('This Transaction no longer exists');
	if (tx.origin === 'opening') throw new Error('An Opening Balance is always cleared');
	if (tx.status === status) return [];
	const { id: _id, ...data } = tx;
	return [{ op: 'setTransaction', id, data: { ...data, status, updatedAt: now } }];
}

/** A Firestore batch holds at most 500 writes, and a bulk change commits as one batch. */
export const MAX_BULK = 500;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the drawer's Mark cleared and the Journal's bulk actions may change. */
export type QuickChange = { status?: Transaction['status']; date?: IsoDate };

/**
 * Sets the status and/or date of each Transaction, nothing else: entries, links (`pays`, `billOn`)
 * and the creation time stay. Transactions already as asked are skipped. A moved date follows the
 * form's rule: on or before today. Throws when any Transaction can't take the change, so a bulk
 * change applies to all or none.
 */
export function planQuickChange(
	chart: Chart,
	ids: string[],
	change: QuickChange,
	{ now, today }: { now: Date; today: IsoDate }
): ChartWrite[] {
	if (change.date !== undefined) {
		if (!ISO_DATE.test(change.date)) throw new Error('Choose a date');
		if (change.date > today)
			throw new Error('Record it on the day, or use a Scheduled Transaction');
	}
	const writes: ChartWrite[] = [];
	for (const id of new Set(ids)) {
		const tx = chart.transaction(id);
		if (!tx) throw new Error('This Transaction no longer exists');
		if (tx.origin === 'opening') throw new Error('An Opening Balance is always cleared');
		const status = change.status ?? tx.status;
		const date = change.date ?? tx.date;
		if (status === tx.status && date === tx.date) continue;
		const { id: _id, ...data } = tx;
		writes.push({ op: 'setTransaction', id, data: { ...data, status, date, updatedAt: now } });
	}
	if (writes.length > MAX_BULK)
		throw new Error(`Change at most ${MAX_BULK} Transactions at a time`);
	return writes;
}

/** The drawer's Mark cleared: clears one Transaction, optionally moving it to `date`. */
export function planClear(
	chart: Chart,
	id: string,
	{ date, now, today }: { date?: IsoDate; now: Date; today: IsoDate }
): ChartWrite[] {
	return planQuickChange(
		chart,
		[id],
		{ status: 'cleared', ...(date ? { date } : {}) },
		{ now, today }
	);
}

/** The selection after the visible rows change: only ids still shown stay selected. */
export function selectionAfterFilter(selected: Set<string>, visible: string[]): Set<string> {
	return new Set(visible.filter((id) => selected.has(id)));
}
