import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { cutoffOf, dueByCutoff, filterPlansList, plansList } from './installment-views.ts';
import { flatRows } from './installments.ts';
import type { Installment, Transaction } from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const peso = (p: number) => Math.round(p * 100);
const today = '2026-11-10';
const accounts = [
	...roots,
	account('bpi', 'asset', 'asset'),
	account('ub', 'liability', 'liability'),
	account('jcb', 'liability', 'liability'),
	account('old', 'liability', 'liability'),
	account('finance', 'expense', 'expense')
];
const plan = (
	id: string,
	title: string,
	rows: Installment['rows'],
	trackedFrom = 1
): Installment => ({
	id,
	kind: 'lender',
	title,
	note: '',
	tags: [],
	purchaseDate: '2026-08-24',
	entry: 'flat',
	rule: { type: 'monthly', day: Number(rows[0].date.slice(8)), start: rows[0].date },
	trackedFrom,
	accounts: { repaid: id, paying: 'bpi', interest: 'finance', fees: 'finance' },
	rows,
	createdAt: now,
	updatedAt: now
});
// UB Paydirect: ₱6,500 over 5 months on day 30, row 1 (30 Oct) overdue.
const ub = plan(
	'ub',
	'UB Paydirect',
	flatRows({
		amount: peso(6500),
		count: 5,
		interest: 0,
		rule: { type: 'monthly', day: 30, start: '2026-10-30' }
	})
);
// ANV15 JCB: ₱45,999 over 12 months from 15 Sep, tracked from row 2, which is partly paid.
const jcb = plan(
	'jcb',
	'ANV15 JCB',
	flatRows({
		amount: peso(45999),
		count: 12,
		interest: 0,
		rule: { type: 'monthly', day: 15, start: '2026-09-15' }
	}),
	2
);
// A finished plan: one row, fully paid.
const old = plan('old', 'Old phone', [
	{
		n: 1,
		due: '2026-10-05',
		date: '2026-10-05',
		principal: peso(500),
		interest: 0,
		additionals: []
	}
]);
const pays = (id: string, planId: string, due: string, amount: number): Transaction => ({
	...tx(id, '2026-11-01', [
		['bpi', -amount],
		[planId, amount]
	]),
	pays: { plan: 'installment', planId, due }
});
const chart = buildChart(accounts, [
	pays('a', 'jcb', '2026-10-15', peso(1000)),
	pays('b', 'old', '2026-10-05', peso(500))
]);

describe('cutoffOf', () => {
	it('puts days 1–15 on the 15th and the rest on the 30th, or the last day of February', () => {
		expect(cutoffOf('2026-11-01')).toBe('2026-11-15');
		expect(cutoffOf('2026-11-15')).toBe('2026-11-15');
		expect(cutoffOf('2026-11-16')).toBe('2026-11-30');
		expect(cutoffOf('2026-12-31')).toBe('2026-12-30');
		expect(cutoffOf('2027-02-28')).toBe('2027-02-28');
		expect(cutoffOf('2028-02-20')).toBe('2028-02-29');
	});
});

describe('plansList', () => {
	it('lists overdue plans first, then by next date, finished plans last', () => {
		const list = plansList(chart, [old, ub, jcb], { today });
		expect(list.map((p) => [p.plan.id, p.overdue])).toEqual([
			['jcb', true],
			['ub', true],
			['old', false]
		]);
		expect(list[0].summary).toMatchObject({
			balance: peso(45999 - 3833.25 - 1000),
			doneRows: 1,
			rowCount: 12
		});
		expect(list[2].summary.next).toBeUndefined();
	});
});

describe('filterPlansList', () => {
	const list = plansList(chart, [old, ub, jcb], { today });
	const ids = (show: 'open' | 'done' | 'all', q = '') =>
		filterPlansList(chart, list, { show, q }).map((l) => l.plan.id);

	it('keeps open plans (with a next row), finished ones, or all, in the same order', () => {
		expect(ids('open')).toEqual(['jcb', 'ub']);
		expect(ids('done')).toEqual(['old']);
		expect(ids('all')).toEqual(['jcb', 'ub', 'old']);
	});

	it('searches the title and the repaid Account name, ignoring case and spaces around', () => {
		expect(ids('all', '  paydirect ')).toEqual(['ub']);
		expect(ids('all', 'JCB')).toEqual(['jcb']);
		expect(ids('open', 'nothing like it')).toEqual([]);
	});
});

describe('dueByCutoff', () => {
	it('groups unpaid tracked rows: Overdue first, then by Cut-off, each with its total', () => {
		const groups = dueByCutoff(chart, [old, ub, jcb], { today, until: '2027-02-10' });
		expect(groups.map((g) => [g.key, g.total])).toEqual([
			['overdue', peso(2833.25 + 1300)],
			['2026-11-15', peso(3833.25)],
			['2026-11-30', peso(1300)],
			['2026-12-15', peso(3833.25)],
			['2026-12-30', peso(1300)],
			['2027-01-15', peso(3833.25)],
			['2027-01-30', peso(1300)]
		]);
		expect(
			groups[0].items.map((i) => [
				i.plan.id,
				i.status.row.n,
				i.of,
				i.status.state,
				i.status.remaining
			])
		).toEqual([
			['jcb', 2, 12, 'partly-paid', peso(2833.25)],
			['ub', 1, 5, 'unpaid', peso(1300)]
		]);
	});

	it('shows every remaining row without a limit', () => {
		const groups = dueByCutoff(chart, [ub], { today });
		expect(groups.at(-1)).toMatchObject({ key: '2027-02-28', total: peso(1300) });
	});
});
