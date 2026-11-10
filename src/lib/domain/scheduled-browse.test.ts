import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import type { PlanLine, RepeatRule, Scheduled } from './schemas.ts';
import { upcoming } from './scheduled-views.ts';
import {
	filterUpcoming,
	groupPlans,
	noPlanFilters,
	type PlanGroup,
	planRows,
	type PlanFilters,
	type PlanSort
} from './scheduled-browse.ts';
import { account, now, roots } from './test-fixtures.ts';

const accounts = [
	...roots,
	account('bpi', 'asset', 'asset', { name: 'BPI Savings' }),
	account('rent', 'expense', 'expense', { name: 'Rent' }),
	account('water', 'expense', 'expense', { name: 'Water bill' }),
	account('salary', 'income', 'income', { name: 'Salary' }),
	account('mp2', 'asset', 'asset', { name: 'Pag-IBIG MP2' })
];
const chart = buildChart(accounts, []);
const today = '2026-11-10';

const pays = (from: string, to: string, amount: number | null): PlanLine[] => [
	{ accountId: from, side: 'from', amount },
	{ accountId: to, side: 'to', amount }
];
const plan = (
	id: string,
	description: string,
	lines: PlanLine[],
	{
		rule = { type: 'monthly', day: 5, start: '2026-10-05' },
		tags = [],
		note = '',
		end = { type: 'never' }
	}: {
		rule?: RepeatRule;
		tags?: string[];
		note?: string;
		end?: Scheduled['end'];
	} = {}
): Scheduled => ({
	id,
	versions: [{ from: '2026-01-01', description, note, tags, lines, rule }],
	end,
	occurrences: {},
	createdAt: now,
	updatedAt: now
});

const rent = plan('p-rent', 'Rent', pays('bpi', 'rent', 1200000), { tags: ['home'] });
const water = plan('p-water', 'Water', pays('bpi', 'water', null), {
	rule: { type: 'monthly', day: 20, start: '2026-10-20' },
	tags: ['home', 'utilities']
});
const pay = plan('p-salary', 'Payday', pays('salary', 'bpi', 3000000), {
	rule: { type: 'cutoff', start: '2026-10-15' },
	note: 'from the office'
});
const gym = plan('p-gym', 'Gym membership', pays('bpi', 'rent', 150000), {
	rule: { type: 'once', date: '2026-03-01' }
});
const all = [rent, water, pay, gym];
const ids = (rows: { plan: Scheduled }[]) => rows.map((r) => r.plan.id);

describe('planRows', () => {
	it('lists active plans by next date, leaving ended ones out by default', () => {
		expect(ids(planRows(chart, all, noPlanFilters(), { today }))).toEqual([
			'p-salary',
			'p-water',
			'p-rent'
		]);
	});

	it('shows only ended plans, or every plan', () => {
		const show = (s: 'ended' | 'all') =>
			ids(planRows(chart, all, { ...noPlanFilters(), show: s }, { today }));
		expect(show('ended')).toEqual(['p-gym']);
		expect(show('all')).toEqual(['p-salary', 'p-water', 'p-rent', 'p-gym']);
	});

	it('searches Description, Note, tags and Account names, ignoring case', () => {
		const search = (q: string) =>
			ids(planRows(chart, all, { ...noPlanFilters(), show: 'all', q }, { today }));
		expect(search('  GYM ')).toEqual(['p-gym']);
		expect(search('office')).toEqual(['p-salary']);
		expect(search('utilities')).toEqual(['p-water']);
		expect(search('#utilities')).toEqual(['p-water']);
		expect(search('water bill')).toEqual(['p-water']);
		expect(search('bpi savings')).toEqual(['p-salary', 'p-water', 'p-rent', 'p-gym']);
	});

	it('filters by kind, by Account (a Group covers everything under it) and by tag', () => {
		const filter = (f: Partial<PlanFilters>) =>
			ids(planRows(chart, all, { ...noPlanFilters(), show: 'all', ...f }, { today }));
		expect(filter({ kind: 'income' })).toEqual(['p-salary']);
		expect(filter({ kind: 'expense' })).toEqual(['p-water', 'p-rent', 'p-gym']);
		expect(filter({ accountId: 'water' })).toEqual(['p-water']);
		expect(filter({ accountId: 'income' })).toEqual(['p-salary']);
		expect(filter({ tag: 'home' })).toEqual(['p-water', 'p-rent']);
	});

	it('sorts by Description, or by amount largest first with varying amounts last', () => {
		const sorted = (sort: PlanSort) =>
			planRows(chart, all, { ...noPlanFilters(), show: 'all' }, { today, sort });
		expect(ids(sorted('description'))).toEqual(['p-gym', 'p-salary', 'p-rent', 'p-water']);
		expect(sorted('amount').map((r) => [r.plan.id, r.amount])).toEqual([
			['p-salary', 3000000],
			['p-rent', 1200000],
			['p-gym', 150000],
			['p-water', null]
		]);
	});
});

describe('groupPlans', () => {
	const rows = planRows(chart, all, { ...noPlanFilters(), show: 'all' }, { today });
	const grouped = (by: PlanGroup) => groupPlans(rows, by).map((g) => [g.key, ids(g.rows)]);

	it('keeps one unnamed group when not grouping', () => {
		expect(grouped('none')).toEqual([['', ['p-salary', 'p-water', 'p-rent', 'p-gym']]]);
	});

	it('groups by kind and by repeat rule, in a fixed order, leaving out empty groups', () => {
		expect(grouped('kind')).toEqual([
			['expense', ['p-water', 'p-rent', 'p-gym']],
			['income', ['p-salary']]
		]);
		expect(grouped('repeat')).toEqual([
			['cutoff', ['p-salary']],
			['monthly', ['p-water', 'p-rent']],
			['once', ['p-gym']]
		]);
	});

	it('groups by tag A–Z, a plan under each of its tags, untagged plans last', () => {
		expect(grouped('tag')).toEqual([
			['home', ['p-water', 'p-rent']],
			['utilities', ['p-water']],
			['', ['p-salary', 'p-gym']]
		]);
	});
});

describe('filterUpcoming', () => {
	it('applies the search and filters to the version each Occurrence uses', () => {
		const views = upcoming(chart, all, { today });
		const plansKept = (f: Partial<PlanFilters>) => [
			...new Set(filterUpcoming(chart, views, { ...noPlanFilters(), ...f }).map((v) => v.plan.id))
		];
		expect(plansKept({})).toEqual(['p-gym', 'p-rent', 'p-salary', 'p-water']);
		expect(plansKept({ q: 'payday' })).toEqual(['p-salary']);
		expect(plansKept({ tag: 'utilities' })).toEqual(['p-water']);
		expect(plansKept({ kind: 'expense', accountId: 'rent' })).toEqual(['p-gym', 'p-rent']);
	});

	it('judges an Occurrence by its own version, not the latest', () => {
		const renamed: Scheduled = {
			...rent,
			versions: [
				rent.versions[0],
				{ ...rent.versions[0], from: '2026-12-01', description: 'Condo rent' }
			]
		};
		const dues = (q: string) =>
			filterUpcoming(chart, upcoming(chart, [renamed], { today }), { ...noPlanFilters(), q }).map(
				(v) => v.occurrence.due
			);
		expect(dues('condo')).toEqual(['2026-12-05']);
	});
});
