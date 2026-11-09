import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { clearedBalance, register } from './register.ts';
import type { Transaction } from './schemas.ts';
import { account, opening, roots, tx } from './test-fixtures.ts';

const t = (
	id: string,
	date: string,
	entries: [string, number][],
	extra: Partial<Transaction> = {}
): Transaction => ({ ...tx(id, date, entries), ...extra });
const at = (iso: string) => new Date(iso);

const chart = buildChart(
	[
		...roots,
		account('banks', 'asset', 'asset', { name: 'Banks' }),
		account('bpi', 'asset', 'banks', { name: 'BPI Savings' }),
		account('bdo', 'asset', 'banks', { name: 'BDO Savings' }),
		account('gcash', 'asset', 'asset', { name: 'GCash' }),
		account('cc', 'liability', 'liability', { name: 'BDO Visa' }),
		account('salary', 'income', 'income', { name: 'Salary' }),
		account('rent', 'expense', 'expense', { name: 'Rent' }),
		account('food', 'expense', 'expense', { name: 'Groceries' })
	],
	[
		opening('bpi', 4200000),
		opening('cc', -850000),
		// Two on the same date: entry time decides their order.
		t(
			'rent',
			'2026-10-15',
			[
				['bpi', -1200000],
				['rent', 1200000]
			],
			{ createdAt: at('2026-10-15T10:00:00Z') }
		),
		t(
			'salary',
			'2026-10-15',
			[
				['salary', -2350000],
				['bpi', 2350000]
			],
			{ createdAt: at('2026-10-15T08:00:00Z') }
		),
		t('move', '2026-10-20', [
			['bpi', -500000],
			['bdo', 500000]
		]),
		t(
			'topup',
			'2026-10-21',
			[
				['bpi', -100000],
				['gcash', 100000]
			],
			{ status: 'pending' }
		),
		t(
			'groceries',
			'2026-10-22',
			[
				['cc', -245000],
				['food', 245000]
			],
			{ status: 'pending' }
		),
		t('pay-card', '2026-10-28', [
			['bpi', -850000],
			['cc', 850000]
		])
	]
);
const rows = (id: string) =>
	register(chart, id).map((r) => [r.tx.id, r.change, r.balance, r.counter]);

describe('register', () => {
	it('lists a Leaf Account newest first with its change and running Balance', () => {
		expect(rows('bpi')).toEqual([
			['pay-card', -850000, 3900000, ['BDO Visa']],
			['topup', -100000, 4750000, ['GCash']],
			['move', -500000, 4850000, ['BDO Savings']],
			['rent', -1200000, 5350000, ['Rent']],
			['salary', 2350000, 6550000, ['Salary']],
			['opening_bpi', 4200000, 4200000, ['Opening Balances']]
		]);
	});

	it('shows a credit card in its normal direction: more owed is In', () => {
		expect(rows('cc')).toEqual([
			['pay-card', -850000, 245000, ['BPI Savings']],
			['groceries', 245000, 1095000, ['Groceries']],
			['opening_cc', 850000, 850000, ['Opening Balances']]
		]);
	});

	it('rolls a Group Account up, with internal transfers as a zero change', () => {
		expect(rows('banks')).toEqual([
			['pay-card', -850000, 4400000, ['BDO Visa']],
			['topup', -100000, 5250000, ['GCash']],
			['move', 0, 5350000, 'internal'],
			['rent', -1200000, 5350000, ['Rent']],
			['salary', 2350000, 6550000, ['Salary']],
			['opening_bpi', 4200000, 4200000, ['Opening Balances']]
		]);
	});

	it('ends at the Account Balance', () => {
		for (const id of ['bpi', 'cc', 'banks', 'gcash', 'rent'])
			expect(register(chart, id)[0]?.balance ?? 0).toBe(chart.balance(id));
	});
});

describe('clearedBalance', () => {
	it('counts only cleared Transactions and the Opening Balance', () => {
		expect(clearedBalance(chart, 'bpi')).toBe(3900000 + 100000);
		expect(clearedBalance(chart, 'cc')).toBe(0);
		expect(clearedBalance(chart, 'banks')).toBe(4500000);
		expect(clearedBalance(chart, 'gcash')).toBe(0);
	});
});
