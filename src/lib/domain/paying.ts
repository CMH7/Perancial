// Paying occurrences: the Record form's starting draft, Transactions that could be linked after the
// fact, and setting or clearing a Transaction's paid link. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import { clearSettledWithLastPayment, type PayablePlan } from './payable.ts';
import type { PaidLink, PlanLine, Transaction } from './schemas.ts';
import { addDays } from './scheduled.ts';
import type { OccurrenceView } from './scheduled-views.ts';
import type { DraftLine, TransactionDraft } from './transactions.ts';
import type { ChartWrite } from './writes.ts';

const amountText = (cents: number | null) =>
	cents === null ? '' : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/**
 * The Transaction form for Record: the occurrence's lines and amounts (its own changes included),
 * dated today. When partly paid, one To line on the plan's first To Account asks for what is
 * left; fees are dropped, taken as covered by the first payment.
 */
export function recordDraft(view: OccurrenceView, { today }: { today: IsoDate }): TransactionDraft {
	const { occurrence: occ, status } = view;
	const v = occ.version;
	const indexed = v.lines.map((line, k) => ({ line, amount: occ.amounts[k] }));
	const draftLine = ({ line, amount }: { line: PlanLine; amount: number | null }): DraftLine => ({
		accountId: line.accountId,
		amount: amountText(amount)
	});
	const fromLines = indexed.filter((x) => x.line.side === 'from');
	const base = {
		date: today,
		description: v.description,
		note: v.note,
		status: 'cleared' as const,
		tags: [...v.tags]
	};
	if (status.status === 'partly-paid') {
		const first =
			v.lines.find((l) => l.side === 'to' && !l.fee) ?? v.lines.find((l) => l.side === 'to')!;
		return {
			...base,
			// Blank, so the form fills From with what is left.
			from: fromLines.map((x) => draftLine({ ...x, amount: null })),
			to: [{ accountId: first.accountId, amount: amountText(status.remaining) }],
			fees: []
		};
	}
	return {
		...base,
		from: fromLines.map(draftLine),
		to: indexed.filter((x) => x.line.side === 'to' && !x.line.fee).map(draftLine),
		fees: indexed.filter((x) => x.line.fee).map((x) => ({ ...draftLine(x), mode: x.line.fee! }))
	};
}

const LINK_WINDOW_DAYS = 7;
const dayNumber = (d: IsoDate) =>
	Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

/** Unlinked Transactions on the plan's Accounts within a week of the occurrence, nearest first. */
export function linkCandidates(chart: Chart, view: OccurrenceView): Transaction[] {
	const { occurrence: occ } = view;
	const planAccounts = new Set(occ.version.lines.map((l) => l.accountId));
	const from = addDays(occ.date, -LINK_WINDOW_DAYS);
	const to = addDays(occ.date, LINK_WINDOW_DAYS);
	const distance = (tx: Transaction) => Math.abs(dayNumber(tx.date!) - dayNumber(occ.date));
	return chart
		.transactions()
		.filter((tx) => tx.origin === 'normal' && !tx.pays)
		.filter((tx) => tx.date! >= from && tx.date! <= to)
		.filter((tx) => tx.entries.some((e) => planAccounts.has(e.accountId)))
		.sort((a, b) => distance(a) - distance(b) || a.date!.localeCompare(b.date!));
}

function setPays(chart: Chart, txId: string, pays: PaidLink | null, now: Date): ChartWrite[] {
	const tx = chart.transaction(txId);
	if (!tx) throw new Error('This Transaction no longer exists');
	if (tx.origin === 'opening') throw new Error('An Opening Balance pays nothing');
	const { id, ...data } = tx;
	return [{ op: 'setTransaction', id, data: { ...data, pays, updatedAt: now } }];
}

/** Links a Transaction to the occurrence it pays. A Transaction pays at most one occurrence. */
export function planLink(
	chart: Chart,
	txId: string,
	link: PaidLink,
	{ now }: { now: Date }
): ChartWrite[] {
	const current = chart.transaction(txId)?.pays;
	if (
		current &&
		(current.plan !== link.plan || current.planId !== link.planId || current.due !== link.due)
	)
		throw new Error('This Transaction already pays another occurrence: unlink it first');
	return setPays(chart, txId, link, now);
}

/**
 * Removes a Transaction's paid link; the Transaction stays. With `plans`, a "Mark paid" left
 * without any payment is cleared in the same write.
 */
export function planUnlink(
	chart: Chart,
	txId: string,
	{ now, plans = [] }: { now: Date; plans?: PayablePlan[] }
): ChartWrite[] {
	const writes = setPays(chart, txId, null, now);
	return [...writes, ...clearSettledWithLastPayment(chart, chart.transaction(txId)!, plans, now)];
}
