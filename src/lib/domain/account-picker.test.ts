import { describe, expect, it } from 'vitest';
import { pickAccounts, pickerItems } from './account-picker.ts';
import { buildChart } from './chart.ts';
import { account, roots, tx } from './test-fixtures.ts';

const accounts = [
	...roots,
	account('banks', 'asset', 'asset', { name: 'Banks', order: 1 }),
	account('cm', 'asset', 'banks', { name: 'CM', order: 2 }),
	account('reserve', 'asset', 'banks', { name: 'Reserve', order: 1 }),
	account('cash', 'asset', 'asset', { name: 'Cash', order: 2 }),
	account('old', 'asset', 'asset', { name: 'Old wallet', order: 3, archived: true }),
	account('card', 'liability', 'liability', { name: 'Card X' }),
	account('food', 'expense', 'expense', { name: 'Food' }),
	account('salary', 'income', 'income', { name: 'Salary' })
];
const chart = buildChart(accounts, [
	tx('t1', '2026-11-01', [
		['cm', 500_000],
		['salary', -500_000]
	]),
	tx('t2', '2026-11-08', [
		['food', 20_000],
		['cash', -20_000]
	]),
	tx('t3', '2026-11-05', [
		['food', 30_000],
		['card', -30_000]
	])
]);
const leaves = ['cm', 'reserve', 'cash', 'card', 'food', 'salary'];
const items = pickerItems(chart, leaves, { today: '2026-11-10' });
const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe('Account picker items', () => {
	it('carry the name, the path above it, the Account Type and the Balance', () => {
		expect(items.find((i) => i.id === 'cm')).toMatchObject({
			name: 'CM',
			path: 'Banks',
			label: 'Banks › CM',
			type: 'asset',
			balance: 500_000,
			group: false,
			lastUsed: '2026-11-01'
		});
		expect(items.find((i) => i.id === 'reserve')!.lastUsed).toBeNull();
	});

	it('marks archived Accounts and Group Accounts', () => {
		const more = pickerItems(chart, ['banks', 'old'], { today: '2026-11-10' });
		expect(more.find((i) => i.id === 'banks')).toMatchObject({ group: true, label: 'Banks' });
		expect(more.find((i) => i.id === 'old')!.label).toBe('Old wallet (archived)');
	});

	it('skip ids the chart does not hold', () => {
		expect(ids(pickerItems(chart, ['cm', 'gone'], { today: '2026-11-10' }))).toEqual(['cm']);
	});
});

describe('Picking an Account', () => {
	it('lists by chart order by default, Account Types in the usual order', () => {
		expect(ids(pickAccounts(items, {}))).toEqual([
			'reserve',
			'cm',
			'cash',
			'card',
			'salary',
			'food'
		]);
	});

	it('matches every typed word anywhere in the full path, in any case', () => {
		expect(ids(pickAccounts(items, { query: 'bank c' }))).toEqual(['cm']);
		expect(ids(pickAccounts(items, { query: '  FOOD ' }))).toEqual(['food']);
		expect(ids(pickAccounts(items, { query: 'nothing' }))).toEqual([]);
	});

	it('filters by Account Type', () => {
		expect(ids(pickAccounts(items, { type: 'asset' }))).toEqual(['reserve', 'cm', 'cash']);
	});

	it('sorts by name, by Balance (largest first) and by latest use', () => {
		expect(ids(pickAccounts(items, { type: 'asset', sort: 'name' }))).toEqual([
			'cash',
			'cm',
			'reserve'
		]);
		expect(ids(pickAccounts(items, { type: 'asset', sort: 'balance' }))).toEqual([
			'cm',
			'reserve',
			'cash'
		]);
		expect(ids(pickAccounts(items, { sort: 'recent' }))).toEqual([
			'cash',
			'food',
			'card',
			'cm',
			'salary',
			'reserve'
		]);
	});
});
