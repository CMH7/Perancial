import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	CreateAccountForm,
	createFormRules,
	newLeafIds,
	planCreateAccount
} from './create-account.ts';
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
			confirm: null,
			card: false
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
				'"Cash on Hand" has ₱3,250.00 recorded directly. It will move to the new account, and "Cash on Hand" becomes a Group Account.',
			card: false
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
			confirm: null,
			card: false
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
					billOn: null,
					recordedWith: null,
					fromPersons: [],
					toPersons: [],
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

describe('newLeafIds', () => {
	const ids = (...list: string[]) => {
		const queue = [...list];
		return () => queue.shift()!;
	};
	const plan = (parentId: string, children: string[], newIds: string[]) =>
		planCreateAccount(
			chart,
			{
				parentId,
				name: 'New',
				description: '',
				openingBalance: 0,
				children: children.map((name) => ({ name, description: '', openingBalance: 0 }))
			},
			{ newId: ids(...newIds), now }
		);

	it('is the new Account when it has no children', () => {
		expect(newLeafIds(plan('asset', [], ['bpi']))).toEqual(['bpi']);
	});

	it('is the children, in order, when the new Account is a Group', () => {
		expect(newLeafIds(plan('asset', ['Savings', 'Checking'], ['bdo', 's', 'c']))).toEqual([
			's',
			'c'
		]);
	});

	it('is the renamed existing Account when a Leaf with money becomes a Group (ADR 0002)', () => {
		expect(newLeafIds(plan('cash', [], ['cash-group']))).toEqual(['cash']);
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

describe('Credit Card days on a new Account', () => {
	const cards = buildChart(
		[
			...roots,
			account('visa', 'liability', 'liability', { card: { statementDay: 20, dueDay: 9 } }),
			account('food', 'expense', 'expense')
		],
		[
			tx('lunch', '2026-11-03', [
				['food', 20000],
				['visa', -20000]
			])
		]
	);
	const terms = { statementDay: 5, dueDay: 25 };
	const input = { name: 'Mastercard', description: '', openingBalance: 0, children: [] };

	it('are offered for a single new Liability Leaf only', () => {
		expect(createFormRules(cards, 'liability', 0).card).toBe(true);
		expect(createFormRules(cards, 'liability', 2).card).toBe(false);
		expect(createFormRules(cards, 'asset', 0).card).toBe(false);
		expect(createFormRules(cards, 'visa', 0).card).toBe(false);
	});

	it('are written on the new Leaf, and ignored with child rows', () => {
		const leaf = planCreateAccount(
			cards,
			{ ...input, parentId: 'liability', card: terms },
			{ newId: () => 'mc', now }
		);
		expect(leaf[0]).toMatchObject({ op: 'setAccount', id: 'mc', data: { card: terms } });
		const ids = ['group', 'a'];
		const group = planCreateAccount(
			cards,
			{
				...input,
				parentId: 'liability',
				card: terms,
				children: [{ name: 'A', description: '', openingBalance: 0 }]
			},
			{ newId: () => ids.shift()!, now }
		);
		for (const w of group) expect(w).not.toHaveProperty('data.card');
	});

	it('stay with a card that becomes the child when a Group is made over it (ADR 0002)', () => {
		const writes = planCreateAccount(
			cards,
			{ ...input, parentId: 'visa' },
			{ newId: () => 'group', now }
		);
		expect(writes.find((w) => w.id === 'visa')).toMatchObject({
			data: { card: { statementDay: 20, dueDay: 9 } }
		});
		expect(writes.find((w) => w.id === 'group')).not.toHaveProperty('data.card');
	});

	it('drop from a card Leaf with no Entries that gains a child and becomes a Group', () => {
		const empty = buildChart(
			[
				...roots,
				account('amex', 'liability', 'liability', { card: { statementDay: 1, dueDay: 20 } })
			],
			[]
		);
		const writes = planCreateAccount(
			empty,
			{ ...input, parentId: 'amex' },
			{ newId: () => 'a', now }
		);
		expect(writes.find((w) => w.id === 'amex')).toMatchObject({ data: { card: null } });
		expect(newLeafIds(writes)).toEqual(['a']);
	});

	it('parse typed days, and explain a day outside 1–31', () => {
		const typed = {
			parentId: 'liability',
			name: 'MC',
			description: '',
			openingBalance: '',
			children: []
		};
		expect(
			CreateAccountForm.parse({ ...typed, card: { statementDay: ' 5 ', dueDay: '25' } }).card
		).toEqual(terms);
		expect(CreateAccountForm.parse({ ...typed, card: null }).card).toBeNull();
		const result = CreateAccountForm.safeParse({
			...typed,
			card: { statementDay: '0', dueDay: 'x' }
		});
		expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
			['card.statementDay', 'Enter a day from 1 to 31'],
			['card.dueDay', 'Enter a day from 1 to 31']
		]);
	});
});
