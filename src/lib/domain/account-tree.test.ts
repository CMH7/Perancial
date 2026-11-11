import { describe, expect, it } from 'vitest';
import { accountTreeRows, treeGroupIds } from './account-tree.ts';
import { buildChart } from './chart.ts';
import { account, roots } from './test-fixtures.ts';

// Expenses > Living > Meals > Groceries / Dining out; Living > Utilities > Power; Expenses > Rent
const chart = buildChart(
	[
		...roots,
		account('living', 'expense', 'expense', { name: 'Living', order: 1 }),
		account('meals', 'expense', 'living', { name: 'Meals', order: 1 }),
		account('groceries', 'expense', 'meals', { name: 'Groceries', order: 1 }),
		account('dining', 'expense', 'meals', { name: 'Dining out', order: 2 }),
		account('utilities', 'expense', 'living', { name: 'Utilities', order: 2 }),
		account('power', 'expense', 'utilities', { name: 'Power', order: 1 }),
		account('rent', 'expense', 'expense', { name: 'Rent', order: 2 }),
		account('old', 'expense', 'utilities', { name: 'Old gas', order: 2, archived: true })
	],
	[]
);
const ids = (rows: ReturnType<typeof accountTreeRows>) => rows.map((r) => r.account.id);
const allOpen = () => true;
const noneOpen = () => false;

describe('accountTreeRows', () => {
	it('lists the Root Account’s descendants depth-first in order, with their depth', () => {
		const rows = accountTreeRows(chart, 'expense', { isOpen: allOpen });
		expect(ids(rows)).toEqual([
			'living',
			'meals',
			'groceries',
			'dining',
			'utilities',
			'power',
			'rent'
		]);
		expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 2, 1, 2, 0]);
	});

	it('hides the children of closed Group Accounts but still lists the Group Account', () => {
		const rows = accountTreeRows(chart, 'expense', { isOpen: (id) => id === 'living' });
		expect(ids(rows)).toEqual(['living', 'meals', 'utilities', 'rent']);
		expect(rows.map((r) => r.open)).toEqual([true, false, false, false]);
	});

	it('marks a row expandable only when it has children to show', () => {
		const rows = accountTreeRows(chart, 'expense', { isOpen: noneOpen });
		expect(rows.map((r) => [r.account.id, r.expandable])).toEqual([
			['living', true],
			['rent', false]
		]);
	});

	it('leaves archived Accounts out unless asked', () => {
		expect(ids(accountTreeRows(chart, 'expense', { isOpen: allOpen }))).not.toContain('old');
		expect(
			ids(accountTreeRows(chart, 'expense', { isOpen: allOpen, showArchived: true }))
		).toContain('old');
	});

	it('filters by name, case-insensitively, keeping the ancestors of matches open', () => {
		const rows = accountTreeRows(chart, 'expense', { isOpen: noneOpen, filter: '  DINING ' });
		expect(ids(rows)).toEqual(['living', 'meals', 'dining']);
		expect(rows.map((r) => r.open)).toEqual([true, true, false]);
	});

	it('shows everything inside a Group Account whose own name matches', () => {
		const rows = accountTreeRows(chart, 'expense', { isOpen: noneOpen, filter: 'meals' });
		expect(ids(rows)).toEqual(['living', 'meals', 'groceries', 'dining']);
	});

	it('returns nothing when no name matches', () => {
		expect(accountTreeRows(chart, 'expense', { isOpen: allOpen, filter: 'zzz' })).toEqual([]);
	});
});

describe('treeGroupIds', () => {
	it('lists the Group Accounts under a Root Account, not the root itself', () => {
		expect(treeGroupIds(chart, 'expense').sort()).toEqual(['living', 'meals', 'utilities']);
	});
});
