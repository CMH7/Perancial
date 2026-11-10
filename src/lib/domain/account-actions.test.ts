import { describe, expect, it } from 'vitest';
import {
	archiveCheck,
	deleteCheck,
	moveTargets,
	planDeleteAccount,
	planDropAccount,
	planMoveAccount,
	planSetArchived
} from './account-actions.ts';
import { buildChart } from './chart.ts';
import { account, opening, roots, tx } from './test-fixtures.ts';

const chart = buildChart(
	[
		...roots,
		account('maribank', 'asset', 'asset', { name: 'MariBank' }),
		account('savings', 'asset', 'maribank'),
		account('goals', 'asset', 'maribank', { order: 1 }),
		account('travel', 'asset', 'goals'),
		account('cash', 'asset', 'asset', { order: 1 }),
		account('gcash', 'asset', 'asset', { order: 2 }),
		account('spent', 'asset', 'asset', { order: 3 }),
		account('old', 'asset', 'asset', { order: 4, archived: true }),
		account('ploan', 'liability', 'liability'),
		account('food', 'expense', 'expense')
	],
	[
		opening('savings', 4500000),
		opening('cash', 345000),
		opening('spent', 100000),
		tx('lunch', '2026-11-03', [
			['food', 20000],
			['cash', -20000]
		]),
		tx('splurge', '2026-11-04', [
			['food', 100000],
			['spent', -100000]
		])
	]
);
const ids = (list: { id: string }[]) => list.map((a) => a.id).sort();

describe('moveTargets', () => {
	it('offers same-type Groups and empty Leaves outside the Account itself', () => {
		// Not: its own parent (goals), itself, Leaves holding money (savings, cash, spent),
		// archived (old), other types, or Opening Balances.
		expect(ids(moveTargets(chart, 'travel'))).toEqual(['asset', 'gcash', 'maribank']);
	});

	it('never offers a Group its own descendants', () => {
		expect(ids(moveTargets(chart, 'maribank'))).toEqual(['gcash']);
	});

	it('offers nothing for System Accounts', () => {
		expect(moveTargets(chart, 'asset')).toEqual([]);
		expect(moveTargets(chart, 'opening-balances')).toEqual([]);
	});
});

const later = new Date('2026-11-20T00:00:00Z');

describe('planMoveAccount', () => {
	it('moves the Account last among its new siblings; its children come along', () => {
		const writes = planMoveAccount(chart, 'goals', 'asset', { now: later });
		expect(writes).toEqual([
			{
				op: 'setAccount',
				id: 'goals',
				data: expect.objectContaining({ parentId: 'asset', order: 5, updatedAt: later })
			}
		]);
	});

	it('refuses a destination that is not allowed', () => {
		expect(() => planMoveAccount(chart, 'gcash', 'cash', { now: later })).toThrow(
			/can't move there/
		);
		expect(() => planMoveAccount(chart, 'gcash', 'ploan', { now: later })).toThrow(
			/can't move there/
		);
	});
});

describe('planDropAccount', () => {
	const orders = (writes: ReturnType<typeof planDropAccount>) =>
		writes.map((w) => [w.id, w.op === 'setAccount' ? w.data.order : null]);

	it('dragging up puts the Account before the target', () => {
		expect(orders(planDropAccount(chart, 'gcash', 'maribank', { now: later }))).toEqual([
			['gcash', 0],
			['maribank', 1],
			['cash', 2]
		]);
	});

	it('dragging down puts it after the target; a hidden Archived Account keeps its place', () => {
		// asset: maribank 0, cash 1, gcash 2, spent 3, old 4 (archived)
		expect(orders(planDropAccount(chart, 'cash', 'spent', { now: later }))).toEqual([
			['gcash', 1],
			['spent', 2],
			['cash', 3]
		]);
	});

	it('dropping on itself writes nothing', () => {
		expect(planDropAccount(chart, 'cash', 'cash', { now: later })).toEqual([]);
	});

	it('pulls tied orders apart', () => {
		const tied = buildChart(
			[
				...roots,
				account('a', 'asset', 'asset', { order: 1 }),
				account('b', 'asset', 'asset', { order: 1 }),
				account('c', 'asset', 'asset', { order: 1 })
			],
			[]
		);
		const writes = planDropAccount(tied, 'c', 'a', { now: later });
		const after = buildChart(
			[
				...roots,
				...['a', 'b', 'c'].map((id) => {
					const w = writes.find((x) => x.id === id);
					return w?.op === 'setAccount'
						? { id, ...w.data }
						: account(id, 'asset', 'asset', { order: 1 });
				})
			],
			[]
		);
		expect(after.children('asset').map((a) => a.id)).toEqual(['c', 'a', 'b']);
	});

	it('never moves or writes a System Account', () => {
		const equity = buildChart(
			[
				...roots,
				account('capital', 'equity', 'equity', { order: 1 }),
				account('drawings', 'equity', 'equity', { order: 2 })
			],
			[]
		);
		expect(orders(planDropAccount(equity, 'drawings', 'capital', { now: later }))).toEqual([
			['drawings', 1],
			['capital', 2]
		]);
		expect(() => planDropAccount(equity, 'capital', 'opening-balances', { now: later })).toThrow(
			/can't be dropped there/
		);
		expect(() => planDropAccount(chart, 'asset', 'liability', { now: later })).toThrow(
			/can't be dropped there/
		);
	});

	it('refuses a target under a different parent', () => {
		expect(() => planDropAccount(chart, 'travel', 'cash', { now: later })).toThrow(
			/can't be dropped there/
		);
	});
});

describe('archive', () => {
	it('is blocked on System Accounts and on Accounts that hold money', () => {
		expect(archiveCheck(chart, 'asset')).toEqual({
			allowed: false,
			reason: "System Accounts can't be archived."
		});
		expect(archiveCheck(chart, 'cash')).toEqual({
			allowed: false,
			reason: 'Balance is ₱3,250.00. Move the money out first; only ₱0.00 accounts can be archived.'
		});
	});

	it('is allowed at ₱0.00, even with history, and counts the accounts inside', () => {
		expect(archiveCheck(chart, 'spent')).toEqual({ allowed: true, inside: 0 });
		expect(archiveCheck(chart, 'goals')).toEqual({ allowed: true, inside: 1 });
	});

	it('archives and unarchives the whole subtree', () => {
		expect(planSetArchived(chart, 'goals', true, { now: later })).toEqual([
			{
				op: 'setAccount',
				id: 'goals',
				data: expect.objectContaining({ archived: true, updatedAt: later })
			},
			{
				op: 'setAccount',
				id: 'travel',
				data: expect.objectContaining({ archived: true, updatedAt: later })
			}
		]);
		expect(planSetArchived(chart, 'old', false, { now: later })).toEqual([
			{ op: 'setAccount', id: 'old', data: expect.objectContaining({ archived: false }) }
		]);
		expect(() => planSetArchived(chart, 'cash', true, { now: later })).toThrow(/Balance is/);
	});
});

describe('delete', () => {
	it('is blocked on System Accounts and on anything with real Transactions', () => {
		expect(deleteCheck(chart, 'opening-balances')).toEqual({
			allowed: false,
			reason: "System Accounts can't be deleted."
		});
		expect(deleteCheck(chart, 'cash')).toEqual({
			allowed: false,
			reason:
				'It has transactions besides its Opening Balance. Archive it instead (needs a ₱0.00 Balance).'
		});
		expect(deleteCheck(chart, 'expense').allowed).toBe(false);
	});

	it('is allowed when only Opening Balances exist, counting the accounts inside', () => {
		expect(deleteCheck(chart, 'savings')).toEqual({ allowed: true, inside: 0 });
		expect(deleteCheck(chart, 'maribank')).toEqual({ allowed: true, inside: 3 });
	});

	it('deletes the whole subtree and its Opening Balance Transactions', () => {
		expect(planDeleteAccount(chart, 'maribank').map((w) => [w.op, w.id])).toEqual([
			['deleteAccount', 'maribank'],
			['deleteAccount', 'savings'],
			['deleteTransaction', 'opening_savings'],
			['deleteAccount', 'goals'],
			['deleteAccount', 'travel']
		]);
		expect(() => planDeleteAccount(chart, 'cash')).toThrow(/Archive it instead/);
	});

	it('is blocked while an Installment Plan uses the Account or anything inside it', () => {
		const plan = {
			title: 'Laptop',
			accounts: { repaid: 'travel', paying: 'x', interest: null, fees: null }
		};
		expect(deleteCheck(chart, 'maribank', [plan])).toEqual({
			allowed: false,
			reason: 'The Installment Plan "Laptop" uses it. Delete the plan or change its Accounts first.'
		});
		expect(() => planDeleteAccount(chart, 'travel', [plan])).toThrow(/Laptop/);
		expect(deleteCheck(chart, 'savings', [plan]).allowed).toBe(true);
	});

	it('is blocked while a Forecast names the Account as a Funding Account or Paying source', () => {
		const forecast = { what: 'The Forecast for', title: '15 Nov 2026', accounts: { 0: 'travel' } };
		expect(deleteCheck(chart, 'maribank', [forecast])).toEqual({
			allowed: false,
			reason: 'The Forecast for "15 Nov 2026" uses it. Remove it there first.'
		});
	});
});
