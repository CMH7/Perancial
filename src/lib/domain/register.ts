// The Account register: one Account's Transactions with a running Balance, and its Cleared
// Balance. Pure TypeScript, no Firebase imports.
import { toStorage, type Chart } from './chart.ts';
import type { Transaction } from './schemas.ts';

export type RegisterRow = {
	tx: Transaction;
	/** This Account's change, in its normal direction: positive is In (for a card, more owed). */
	change: number;
	/** The Balance after this row, display sign. */
	balance: number;
	/** Names of the Accounts on the other side, or 'internal' when it all stays inside a Group. */
	counter: string[] | 'internal';
};

/** Oldest first: the Opening Balance, then by date, then by entry time. */
const oldestFirst = (a: Transaction, b: Transaction) =>
	(a.date ?? '').localeCompare(b.date ?? '') || +a.createdAt - +b.createdAt;

/** Rows newest first. A Group Account's register rolls up every Account under it. */
export function register(chart: Chart, accountId: string): RegisterRow[] {
	const account = chart.account(accountId);
	if (!account) return [];
	const inside = new Set(chart.subtree(accountId).map((a) => a.id));
	const name = (id: string) => chart.account(id)?.name ?? '(deleted Account)';

	let running = 0;
	const rows = chart
		.transactions()
		.filter((tx) => tx.entries.some((e) => inside.has(e.accountId)))
		.sort(oldestFirst)
		.map((tx): RegisterRow => {
			const stored = tx.entries
				.filter((e) => inside.has(e.accountId))
				.reduce((s, e) => s + e.amount, 0);
			// `+ 0` turns the -0 that negating a zero gives into 0.
			const change = toStorage(account.type, stored) + 0;
			running += change;
			const others = tx.entries.filter((e) => !inside.has(e.accountId));
			return {
				tx,
				change,
				balance: running,
				counter: others.length ? [...new Set(others.map((e) => name(e.accountId)))] : 'internal'
			};
		});
	return rows.reverse();
}

/** The Balance counting only cleared Transactions (an Opening Balance always is). */
export function clearedBalance(chart: Chart, accountId: string): number {
	const account = chart.account(accountId);
	if (!account) return 0;
	const inside = new Set(chart.subtree(accountId).map((a) => a.id));
	const stored = chart
		.transactions()
		.filter((tx) => tx.status === 'cleared')
		.flatMap((tx) => tx.entries)
		.filter((e) => inside.has(e.accountId))
		.reduce((s, e) => s + e.amount, 0);
	return toStorage(account.type, stored) + 0;
}
