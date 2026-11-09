import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { CreateAccountForm, createFormRules, planCreateAccount } from './create-account.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

const chart = buildChart(
	[
		...roots,
		account('cash', 'asset', 'asset', { name: 'Cash on Hand' }),
		account('gcash', 'asset', 'asset', { order: 1 }),
		account('maribank', 'asset', 'asset', { order: 2 }),
		account('savings', 'asset', 'maribank'),
		account('food', 'expense', 'expense'),
		account('ploan', 'liability', 'liability')
	],
	[
		opening('cash', 345000),
		opening('savings', 4500000),
		tx('lunch', '2026-11-03', [
			['food', 20000],
			['cash', -20000]
		])
	]
);

describe('createFormRules', () => {
	it('lets an Asset or Liability Account take an Opening Balance and child rows', () => {
		expect(createFormRules(chart, 'asset', 0)).toEqual({
			opening: { kind: 'editable' },
			childRowsAllowed: true,
			confirm: null
		});
		expect(createFormRules(chart, 'ploan', 0).opening).toEqual({ kind: 'editable' });
	});

	it('shows the sum of the children once there are child rows', () => {
		expect(createFormRules(chart, 'maribank', 1).opening).toEqual({ kind: 'sum' });
		expect(createFormRules(chart, 'asset', 3).opening).toEqual({ kind: 'sum' });
	});

	it('under a Leaf Account with Entries, inherits its money, blocks child rows, and confirms', () => {
		expect(createFormRules(chart, 'cash', 0)).toEqual({
			opening: { kind: 'inherited', amount: 325000 },
			childRowsAllowed: false,
			confirm:
				'"Cash on Hand" has ₱3,250.00 recorded directly. It will move to the new account, and "Cash on Hand" becomes a Group Account.'
		});
	});

	it('applies the same inheritance to Expense Leaves, without an Opening Balance field', () => {
		const rules = createFormRules(chart, 'food', 0);
		expect(rules.opening).toEqual({ kind: 'hidden' });
		expect(rules.childRowsAllowed).toBe(false);
		expect(rules.confirm).toMatch(/"food" has ₱200.00 recorded directly/);
	});

	it('treats a Leaf Account without Entries like any other parent', () => {
		expect(createFormRules(chart, 'gcash', 0)).toEqual({
			opening: { kind: 'editable' },
			childRowsAllowed: true,
			confirm: null
		});
	});

	it('hides the Opening Balance for Income, Expense, and Equity Accounts', () => {
		expect(createFormRules(chart, 'income', 0).opening).toEqual({ kind: 'hidden' });
		expect(createFormRules(chart, 'expense', 2).opening).toEqual({ kind: 'hidden' });
		expect(createFormRules(chart, 'equity', 0).opening).toEqual({ kind: 'hidden' });
	});
});

describe('planCreateAccount', () => {
	const ids = (...list: string[]) => {
		const queue = [...list];
		return () => queue.shift()!;
	};

	it('creates a Leaf Account last among its siblings, with its Opening Balance Transaction', () => {
		const writes = planCreateAccount(
			chart,
			{
				parentId: 'asset',
				name: 'BPI',
				description: 'Checking',
				openingBalance: 200000,
				children: []
			},
			{ newId: ids('bpi'), now }
		);
		expect(writes).toEqual([
			{
				op: 'setAccount',
				id: 'bpi',
				data: {
					name: 'BPI',
					description: 'Checking',
					type: 'asset',
					parentId: 'asset',
					system: null,
					archived: false,
					order: 3,
					createdAt: now,
					updatedAt: now
				}
			},
			{
				op: 'setTransaction',
				id: 'opening_bpi',
				data: {
					date: null,
					origin: 'opening',
					description: 'Opening Balance',
					note: '',
					status: 'cleared',
					tags: [],
					entries: [
						{ accountId: 'bpi', amount: 200000 },
						{ accountId: 'opening-balances', amount: -200000 }
					],
					accountIds: ['bpi', 'opening-balances'],
					pays: null,
					createdAt: now,
					updatedAt: now
				}
			}
		]);
	});

	it('records a Liability owed as a negative Entry, and skips zero or non-applicable amounts', () => {
		const loan = planCreateAccount(
			chart,
			{
				parentId: 'liability',
				name: 'Card',
				description: '',
				openingBalance: 1200000,
				children: []
			},
			{ newId: ids('card'), now }
		);
		expect(loan[1]).toMatchObject({
			op: 'setTransaction',
			data: {
				entries: [
					{ accountId: 'card', amount: -1200000 },
					{ accountId: 'opening-balances', amount: 1200000 }
				]
			}
		});

		const empty = planCreateAccount(
			chart,
			{ parentId: 'asset', name: 'Wallet', description: '', openingBalance: 0, children: [] },
			{ newId: ids('wallet'), now }
		);
		expect(empty.map((w) => w.op)).toEqual(['setAccount']);

		const rent = planCreateAccount(
			chart,
			{ parentId: 'expense', name: 'Rent', description: '', openingBalance: 500, children: [] },
			{ newId: ids('rent'), now }
		);
		expect(rent.map((w) => w.op)).toEqual(['setAccount']);
	});

	it('creates a Group with its child rows in order; only children get Opening Balances', () => {
		const writes = planCreateAccount(
			chart,
			{
				parentId: 'asset',
				name: 'BDO',
				description: '',
				openingBalance: 999, // ignored: a Group's Balance is the sum of its children
				children: [
					{ name: 'Savings', description: '', openingBalance: 1000000 },
					{ name: 'Time Deposit', description: '5 years', openingBalance: 0 }
				]
			},
			{ newId: ids('bdo', 'bdo-sav', 'bdo-td'), now }
		);
		expect(writes.map((w) => [w.op, w.id])).toEqual([
			['setAccount', 'bdo'],
			['setAccount', 'bdo-sav'],
			['setTransaction', 'opening_bdo-sav'],
			['setAccount', 'bdo-td']
		]);
		expect(writes[1]).toMatchObject({ data: { parentId: 'bdo', order: 0, type: 'asset' } });
		expect(writes[3]).toMatchObject({
			data: { parentId: 'bdo', order: 1, name: 'Time Deposit', description: '5 years' }
		});
	});

	it('under a Leaf Account with Entries, renames it into the new child under a new Group (ADR 0002)', () => {
		const later = new Date('2026-11-20T00:00:00Z');
		const writes = planCreateAccount(
			chart,
			{
				parentId: 'cash',
				name: 'Wallet',
				description: 'Daily cash',
				openingBalance: 777, // ignored: the child inherits the existing money
				children: [{ name: 'ignored', description: '', openingBalance: 1 }]
			},
			{ newId: ids('cash-group'), now: later }
		);
		expect(writes).toEqual([
			{
				op: 'setAccount',
				id: 'cash-group',
				data: {
					name: 'Cash on Hand',
					description: '',
					type: 'asset',
					parentId: 'asset',
					system: null,
					archived: false,
					order: 0,
					createdAt: later,
					updatedAt: later
				}
			},
			{
				op: 'setAccount',
				id: 'cash',
				data: {
					name: 'Wallet',
					description: 'Daily cash',
					type: 'asset',
					parentId: 'cash-group',
					system: null,
					archived: false,
					order: 0,
					createdAt: now,
					updatedAt: later
				}
			}
		]);
	});
});

describe('CreateAccountForm', () => {
	const valid = {
		parentId: 'asset',
		name: '  BPI  ',
		description: ' Checking ',
		openingBalance: '₱1,234.50',
		children: []
	};

	it('trims text and turns typed amounts into centavos', () => {
		expect(CreateAccountForm.parse(valid)).toEqual({
			parentId: 'asset',
			name: 'BPI',
			description: 'Checking',
			openingBalance: 123450,
			children: []
		});
	});

	it('explains what is wrong, field by field', () => {
		const result = CreateAccountForm.safeParse({
			...valid,
			name: '   ',
			openingBalance: '12.345',
			children: [{ name: '', description: '', openingBalance: 'abc' }]
		});
		expect(result.success).toBe(false);
		const messages = Object.fromEntries(
			result.error!.issues.map((i) => [i.path.join('.'), i.message])
		);
		expect(messages).toEqual({
			name: 'Name is required',
			openingBalance: 'Enter an amount like 1,234.56',
			'children.0.name': 'Name is required',
			'children.0.openingBalance': 'Enter an amount like 1,234.56'
		});
	});
});
