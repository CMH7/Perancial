// Move, archive, and delete: what is allowed (with a reason when not), and what to write.
import type { Chart } from './chart.ts';
import { formatAmount } from './money.ts';
import type { Account } from './schemas.ts';
import type { ChartWrite } from './writes.ts';

/** Where an Account may move: same type, a Group or an empty Leaf, outside its own subtree. */
export function moveTargets(chart: Chart, id: string): Account[] {
	const account = chart.account(id);
	if (!account || account.system) return [];
	const inside = new Set(chart.subtree(id).map((a) => a.id));
	return chart
		.all()
		.filter(
			(target) =>
				target.type === account.type &&
				!inside.has(target.id) &&
				target.id !== account.parentId &&
				target.system !== 'opening-balances' &&
				!target.archived &&
				(chart.isGroup(target.id) || !chart.hasEntries(target.id))
		);
}

type Now = { now: Date };

/** A setAccount write for an existing Account with some fields changed. */
function updateAccount(account: Account, patch: Partial<Account>, now: Date): ChartWrite {
	const { id, ...data } = { ...account, ...patch, updatedAt: now };
	return { op: 'setAccount', id, data };
}

/** Moves an Account (with everything under it) to a new parent, last among its siblings. */
export function planMoveAccount(
	chart: Chart,
	id: string,
	destId: string,
	{ now }: Now
): ChartWrite[] {
	const account = chart.account(id);
	if (!account || !moveTargets(chart, id).some((t) => t.id === destId))
		throw new Error("This account can't move there");
	const siblings = chart.children(destId, { showArchived: true });
	const order = siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0;
	return [updateAccount(account, { parentId: destId, order }, now)];
}

export type ActionCheck = { allowed: true; inside: number } | { allowed: false; reason: string };

/** Every Entry ever recorded, including future-dated ones. */
const ALL_TIME = '9999-12-31';

/** Archiving needs a ₱0.00 Balance (counting future-dated Entries), so Net Worth never changes. */
export function archiveCheck(chart: Chart, id: string): ActionCheck {
	const account = chart.account(id);
	if (!account) return { allowed: false, reason: 'This account no longer exists.' };
	if (account.system) return { allowed: false, reason: "System Accounts can't be archived." };
	const balance = chart.balance(id, ALL_TIME);
	if (balance !== 0)
		return {
			allowed: false,
			reason: `Balance is ${formatAmount(balance)}. Move the money out first; only ₱0.00 accounts can be archived.`
		};
	return { allowed: true, inside: chart.descendantCount(id) };
}

/** Archives (after `archiveCheck`) or unarchives an Account and everything under it. */
export function planSetArchived(
	chart: Chart,
	id: string,
	archived: boolean,
	{ now }: Now
): ChartWrite[] {
	const check = archived ? archiveCheck(chart, id) : unarchiveCheck(chart, id);
	if (!check.allowed) throw new Error(check.reason);
	return chart.subtree(id).map((a) => updateAccount(a, { archived }, now));
}

function unarchiveCheck(chart: Chart, id: string): ActionCheck {
	const account = chart.account(id);
	if (!account || account.system)
		return { allowed: false, reason: "This account can't be unarchived." };
	return { allowed: true, inside: chart.descendantCount(id) };
}

/** Deleting is for mistakes: only when nothing in the subtree has Transactions besides Opening Balances. */
export function deleteCheck(chart: Chart, id: string): ActionCheck {
	const account = chart.account(id);
	if (!account) return { allowed: false, reason: 'This account no longer exists.' };
	if (account.system) return { allowed: false, reason: "System Accounts can't be deleted." };
	const hasHistory = chart
		.subtree(id)
		.some((a) => chart.transactionsFor(a.id).some((tx) => tx.kind !== 'opening'));
	if (hasHistory)
		return {
			allowed: false,
			reason:
				'It has transactions besides its Opening Balance. Archive it instead (needs a ₱0.00 Balance).'
		};
	return { allowed: true, inside: chart.descendantCount(id) };
}

/** Deletes an Account, everything under it, and their Opening Balance Transactions. */
export function planDeleteAccount(chart: Chart, id: string): ChartWrite[] {
	const check = deleteCheck(chart, id);
	if (!check.allowed) throw new Error(check.reason);
	return chart
		.subtree(id)
		.flatMap((a): ChartWrite[] => [
			{ op: 'deleteAccount', id: a.id },
			...chart
				.transactionsFor(a.id)
				.map((tx): ChartWrite => ({ op: 'deleteTransaction', id: tx.id }))
		]);
}
