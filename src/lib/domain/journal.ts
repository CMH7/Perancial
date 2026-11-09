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
