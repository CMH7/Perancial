import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { EditAccountForm, editFormRules, planEditAccount } from './edit-account.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

const chart = buildChart(
	[
		...roots,
		account('cash', 'asset', 'asset', { name: 'Cash on Hand' }),
		account('maribank', 'asset', 'asset', { order: 1 }),
		account('savings', 'asset', 'maribank'),
		account('food', 'expense', 'expense')
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

describe('editFormRules', () => {
	it('lets a Leaf Asset edit its name, description, and current Opening Balance', () => {
		expect(editFormRules(chart, 'cash')).toEqual({
			editable: true,
			nameEditable: true,
			opening: { kind: 'editable', current: 345000 },
			card: { kind: 'hidden' },
			person: { kind: 'editable', current: null, inherited: null }
		});
	});

	it('shows a Group Account its total instead of an Opening Balance', () => {
		expect(editFormRules(chart, 'maribank').opening).toEqual({ kind: 'sum', amount: 4500000 });
	});

	it('hides the Opening Balance for Expense Accounts', () => {
		expect(editFormRules(chart, 'food').opening).toEqual({ kind: 'hidden' });
	});

	it('allows only the description on a Root Account, and nothing on Opening Balances', () => {
		expect(editFormRules(chart, 'asset')).toEqual({
			editable: true,
			nameEditable: false,
			opening: { kind: 'hidden' },
			card: { kind: 'hidden' },
			person: { kind: 'hidden' }
		});
		expect(editFormRules(chart, 'opening-balances').editable).toBe(false);
	});
});

describe('planEditAccount', () => {
	const later = new Date('2026-11-20T00:00:00Z');
	const edit = (id: string, input: Parameters<typeof planEditAccount>[2]) =>
		planEditAccount(chart, id, input, { now: later });

	it('renames an Account, keeping its creation time and position', () => {
		expect(
			edit('food', { name: 'Food & Dining', description: 'Meals', openingBalance: 0 })
		).toEqual([
			{
				op: 'setAccount',
				id: 'food',
				data: {
					name: 'Food & Dining',
					description: 'Meals',
					type: 'expense',
					parentId: 'expense',
					system: null,
					archived: false,
					order: 0,
					createdAt: now,
					updatedAt: later
				}
			}
		]);
	});

	it('updates an existing Opening Balance Transaction, keeping its creation time', () => {
		const writes = edit('cash', { name: 'Cash on Hand', description: '', openingBalance: 500000 });
		expect(writes[1]).toEqual({
			op: 'setTransaction',
			id: 'opening_cash',
			data: {
				date: null,
				origin: 'opening',
				description: 'Opening Balance',
				note: '',
				status: 'cleared',
				tags: [],
				entries: [
					{ accountId: 'cash', amount: 500000 },
					{ accountId: 'opening-balances', amount: -500000 }
				],
				accountIds: ['cash', 'opening-balances'],
				pays: null,
				billOn: null,
				recordedWith: null,
				fromPersons: [],
				toPersons: [],
				createdAt: now,
				updatedAt: later
			}
		});
	});

	it('deletes the Opening Balance when set to zero, and creates one when there was none', () => {
		const cleared = edit('cash', { name: 'Cash on Hand', description: '', openingBalance: 0 });
		expect(cleared.map((w) => [w.op, w.id])).toEqual([
			['setAccount', 'cash'],
			['deleteTransaction', 'opening_cash']
		]);

		const fresh = planEditAccount(
			buildChart([...roots, account('gcash', 'asset', 'asset')], []),
			'gcash',
			{ name: 'gcash', description: '', openingBalance: 100000 },
			{ now: later }
		);
		expect(fresh[1]).toMatchObject({
			op: 'setTransaction',
			id: 'opening_gcash',
			data: { createdAt: later, entries: [{ accountId: 'gcash', amount: 100000 }, {}] }
		});
	});

	it('leaves the Opening Balance alone when unchanged, and never touches one on a Group', () => {
		expect(
			edit('cash', { name: 'Wallet', description: '', openingBalance: 345000 }).map((w) => w.op)
		).toEqual(['setAccount']);
		expect(
			edit('maribank', { name: 'MariBank', description: '', openingBalance: 1 }).map((w) => w.op)
		).toEqual(['setAccount']);
	});

	it('changes only the description of a Root Account, and refuses Opening Balances', () => {
		expect(edit('asset', { name: 'Stuff', description: 'Mine', openingBalance: 5 })).toEqual([
			{
				op: 'setAccount',
				id: 'asset',
				data: expect.objectContaining({ name: 'asset', description: 'Mine', updatedAt: later })
			}
		]);
		expect(() =>
			edit('opening-balances', { name: 'x', description: '', openingBalance: 0 })
		).toThrow(/cannot be edited/);
	});
});

describe('EditAccountForm', () => {
	it('trims text, parses the amount, and reports problems by field', () => {
		expect(
			EditAccountForm.parse({ name: ' Wallet ', description: '', openingBalance: '5,000' })
		).toEqual({ name: 'Wallet', description: '', openingBalance: 500000 });
		const result = EditAccountForm.safeParse({ name: '', description: '', openingBalance: 'x' });
		expect(result.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
			['name', 'Name is required'],
			['openingBalance', 'Enter an amount like 1,234.56']
		]);
	});
});

describe('Credit Card terms', () => {
	const cards = buildChart(
		[
			...roots,
			account('visa', 'liability', 'liability', { card: { statementDay: 20, dueDay: 9 } }),
			account('loan', 'liability', 'liability'),
			account('banks', 'liability', 'liability'),
			account('bpi', 'liability', 'banks'),
			account('cash', 'asset', 'asset')
		],
		[
			opening('loan', -500000),
			tx('lunch', '2026-11-03', [
				['cash', 20000],
				['loan', -20000]
			])
		]
	);
	const base = { name: 'Loan', description: '', openingBalance: 500000 };

	it('are offered on a Liability Leaf, with its current days', () => {
		expect(editFormRules(cards, 'visa').card).toEqual({
			kind: 'editable',
			current: { statementDay: 20, dueDay: 9 }
		});
		expect(editFormRules(cards, 'loan').card).toEqual({ kind: 'editable', current: null });
	});

	it('are not offered on a Group, a Root Account, or another Account Type', () => {
		for (const id of ['banks', 'liability', 'cash'])
			expect(editFormRules(cards, id).card).toEqual({ kind: 'hidden' });
	});

	it('turn a Liability into a Credit Card in place, keeping its history', () => {
		const writes = planEditAccount(
			cards,
			'loan',
			{ ...base, card: { statementDay: 5, dueDay: 25 } },
			{ now }
		);
		expect(writes).toEqual([
			{
				op: 'setAccount',
				id: 'loan',
				data: expect.objectContaining({ card: { statementDay: 5, dueDay: 25 } })
			}
		]);
	});

	it('are removed with null, and left alone when not given', () => {
		const cleared = planEditAccount(
			cards,
			'visa',
			{ ...base, name: 'Visa', openingBalance: 0, card: null },
			{ now }
		);
		expect(cleared[0]).toMatchObject({ op: 'setAccount', data: { card: null } });
		const kept = planEditAccount(
			cards,
			'visa',
			{ ...base, name: 'Visa', openingBalance: 0 },
			{ now }
		);
		expect(kept[0]).toMatchObject({ data: { card: { statementDay: 20, dueDay: 9 } } });
	});
});

describe('Person link', () => {
	const people = buildChart(
		[
			...roots,
			account('payables', 'liability', 'liability', { personId: 'parent' }),
			account('payables-eom', 'liability', 'payables', { personId: 'sibling' }),
			account('payables-15th', 'liability', 'payables'),
			account('allowance', 'income', 'income')
		],
		[]
	);
	const base = { description: '', openingBalance: 0 };

	it('is offered on any user Account, with its own and its inherited Person', () => {
		expect(editFormRules(people, 'payables-eom').person).toEqual({
			kind: 'editable',
			current: 'sibling',
			inherited: 'parent'
		});
		expect(editFormRules(people, 'payables-15th').person).toEqual({
			kind: 'editable',
			current: null,
			inherited: 'parent'
		});
		expect(editFormRules(people, 'allowance').person).toEqual({
			kind: 'editable',
			current: null,
			inherited: null
		});
		expect(editFormRules(people, 'income').person).toEqual({ kind: 'hidden' });
		expect(editFormRules(people, 'opening-balances').person).toEqual({ kind: 'hidden' });
	});

	it('is set, removed with null, and left alone when not given', () => {
		const edit = (id: string, personId?: string | null) =>
			planEditAccount(people, id, { ...base, name: id, personId }, { now })[0];
		expect(edit('allowance', 'parent')).toMatchObject({ data: { personId: 'parent' } });
		expect(edit('payables-eom', null)).toMatchObject({ data: { personId: null } });
		expect(edit('payables-eom')).toMatchObject({ data: { personId: 'sibling' } });
	});

	it('is never written on a Root Account', () => {
		const writes = planEditAccount(
			people,
			'income',
			{ ...base, name: 'Income', personId: 'parent' },
			{ now }
		);
		expect(writes[0]).not.toHaveProperty('data.personId');
	});
});
