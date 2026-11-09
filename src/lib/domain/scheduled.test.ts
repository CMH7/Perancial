import { describe, expect, it } from 'vitest';
import type { PlanVersion, RepeatRule, Scheduled } from './schemas.ts';
import { buildChart } from './chart.ts';
import {
	occurrencesOf,
	occurrenceStatus,
	planChangeAll,
	planChangeFollowing,
	planChangeOccurrence,
	planDeletePlan,
	planEndPlan
} from './scheduled.ts';
import type { ChartWrite } from './writes.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const version = (rule: RepeatRule, extra: Partial<PlanVersion> = {}): PlanVersion => ({
	from: 'start' in rule ? rule.start : rule.date,
	description: 'Plan',
	note: '',
	tags: [],
	lines: [
		{ accountId: 'bpi', side: 'from', amount: null },
		{ accountId: 'rent', side: 'to', amount: 1200000 },
		{ accountId: 'bank-fees', side: 'to', amount: 1500, fee: 'additional' }
	],
	rule,
	...extra
});
export const plan = (versions: PlanVersion[], extra: Partial<Scheduled> = {}): Scheduled => ({
	id: 'p1',
	versions,
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now,
	...extra
});
const dues = (p: Scheduled, from: string, to: string) =>
	occurrencesOf(p, { from, to }).map((o) => o.due);

describe('occurrencesOf: repeat rules', () => {
	it('once: just its date', () => {
		const p = plan([version({ type: 'once', date: '2026-12-01' })]);
		expect(dues(p, '2026-01-01', '2027-12-31')).toEqual(['2026-12-01']);
	});

	it('every cut-off: the 15th and the 30th, the last day of February', () => {
		const p = plan([version({ type: 'cutoff', start: '2026-01-20' })]);
		expect(dues(p, '2026-01-01', '2026-03-31')).toEqual([
			'2026-01-30',
			'2026-02-15',
			'2026-02-28',
			'2026-03-15',
			'2026-03-30'
		]);
		const leap = plan([version({ type: 'cutoff', start: '2028-02-01' })]);
		expect(dues(leap, '2028-02-01', '2028-02-29')).toEqual(['2028-02-15', '2028-02-29']);
	});

	it('monthly on day N, a short month using its last day', () => {
		const p = plan([version({ type: 'monthly', day: 31, start: '2026-01-31' })]);
		expect(dues(p, '2026-01-01', '2026-04-30')).toEqual([
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
			'2026-04-30'
		]);
	});

	it('every N weeks from the start date', () => {
		const p = plan([version({ type: 'weekly', every: 2, start: '2026-01-02' })]);
		expect(dues(p, '2026-01-01', '2026-02-15')).toEqual([
			'2026-01-02',
			'2026-01-16',
			'2026-01-30',
			'2026-02-13'
		]);
	});

	it('yearly, 29 February falling on the 28th in other years', () => {
		const p = plan([version({ type: 'yearly', start: '2028-02-29' })]);
		expect(dues(p, '2028-01-01', '2030-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28']);
	});
});

describe('occurrencesOf: ends, versions and changes', () => {
	const monthly = version({ type: 'monthly', day: 5, start: '2026-01-05' });

	it('ends on a date, or after N occurrences counted across versions', () => {
		expect(
			dues(plan([monthly], { end: { type: 'on', date: '2026-03-05' } }), '2026-01-01', '2026-12-31')
		).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
		const twoVersions = [
			monthly,
			version({ type: 'monthly', day: 10, start: '2026-03-10' }, { from: '2026-03-01' })
		];
		expect(
			dues(plan(twoVersions, { end: { type: 'after', count: 4 } }), '2026-01-01', '2026-12-31')
		).toEqual(['2026-01-05', '2026-02-05', '2026-03-10', '2026-04-10']);
	});

	it('uses the version in force on each due date', () => {
		const p = plan([
			monthly,
			version(
				{ type: 'monthly', day: 5, start: '2026-03-05' },
				{ from: '2026-03-05', description: 'Rent, new rate' }
			)
		]);
		expect(
			occurrencesOf(p, { from: '2026-02-01', to: '2026-03-31' }).map((o) => [
				o.due,
				o.version.description
			])
		).toEqual([
			['2026-02-05', 'Plan'],
			['2026-03-05', 'Rent, new rate']
		]);
	});

	it('applies skips, moves and amounts, keeping the rule date as identity', () => {
		const p = plan([monthly], {
			occurrences: {
				'2026-02-05': { skipped: true },
				'2026-03-05': { movedTo: '2026-03-07', amounts: [null, 1300000, 1500] }
			}
		});
		const [feb, mar] = occurrencesOf(p, { from: '2026-02-01', to: '2026-03-31' });
		expect(feb).toMatchObject({ due: '2026-02-05', date: '2026-02-05', skipped: true });
		expect(mar).toMatchObject({ due: '2026-03-05', date: '2026-03-07', total: 1301500 });
	});

	it('totals the To side, fees included, and leaves it open when a To amount varies', () => {
		const [jan] = occurrencesOf(plan([monthly]), { from: '2026-01-01', to: '2026-01-31' });
		expect(jan.total).toBe(1201500);
		const varies = plan([
			version(
				{ type: 'monthly', day: 5, start: '2026-01-05' },
				{
					lines: [
						{ accountId: 'bpi', side: 'from', amount: null },
						{ accountId: 'electricity', side: 'to', amount: null }
					]
				}
			)
		]);
		expect(occurrencesOf(varies, { from: '2026-01-01', to: '2026-01-31' })[0].total).toBeNull();
	});

	it('finds a moved occurrence by its new date', () => {
		const p = plan([monthly], { occurrences: { '2026-03-05': { movedTo: '2026-04-01' } } });
		expect(dues(p, '2026-04-01', '2026-04-03')).toEqual(['2026-03-05']);
		expect(dues(p, '2026-03-01', '2026-03-31')).toEqual([]);
	});
});

describe('occurrenceStatus', () => {
	const monthly = version({ type: 'monthly', day: 5, start: '2026-01-05' });
	const pays = (id: string, due: string, amount: number, planId = 'p1') => ({
		...tx(id, '2026-03-01', [
			['bpi', -amount],
			['rent', amount]
		]),
		pays: { plan: 'scheduled' as const, planId, due }
	});
	const chartWith = (...txs: ReturnType<typeof pays>[]) =>
		buildChart(
			[...roots, account('bpi', 'asset', 'asset'), account('rent', 'expense', 'expense')],
			txs
		);
	const occ = (p = plan([monthly]), due = '2026-03-05') =>
		occurrencesOf(p, { from: due, to: due })[0];
	const today = '2026-03-10';

	it('is unpaid and overdue past its date with no paying Transaction', () => {
		expect(occurrenceStatus(chartWith(), occ(), { today })).toEqual({
			status: 'unpaid',
			overdue: true,
			paid: 0,
			remaining: 1201500,
			payments: []
		});
		expect(occurrenceStatus(chartWith(), occ(), { today: '2026-03-05' }).overdue).toBe(false);
	});

	it('is partly paid until the payments reach the total, then paid (overpaying allowed)', () => {
		const part = occurrenceStatus(chartWith(pays('a', '2026-03-05', 500000)), occ(), { today });
		expect(part).toMatchObject({
			status: 'partly-paid',
			overdue: true,
			paid: 500000,
			remaining: 701500
		});
		const full = occurrenceStatus(
			chartWith(pays('a', '2026-03-05', 500000), pays('b', '2026-03-05', 800000)),
			occ(),
			{ today }
		);
		expect(full).toMatchObject({ status: 'paid', overdue: false, paid: 1300000, remaining: 0 });
		expect(full.payments.map((t) => t.id)).toEqual(['a', 'b']);
	});

	it('ignores payments for other occurrences or plans', () => {
		const chart = chartWith(
			pays('a', '2026-02-05', 1201500),
			pays('b', '2026-03-05', 1201500, 'p2')
		);
		expect(occurrenceStatus(chart, occ(), { today }).status).toBe('unpaid');
	});

	it('counts Mark paid only once a Transaction pays it, and needs it when the total varies', () => {
		const settled = plan([monthly], { occurrences: { '2026-03-05': { settled: true } } });
		expect(occurrenceStatus(chartWith(), occ(settled), { today }).status).toBe('unpaid');
		expect(
			occurrenceStatus(chartWith(pays('a', '2026-03-05', 1000000)), occ(settled), { today })
		).toMatchObject({ status: 'paid', remaining: 0 });
		const varies = plan([
			version(
				{ type: 'monthly', day: 5, start: '2026-01-05' },
				{
					lines: [
						{ accountId: 'bpi', side: 'from', amount: null },
						{ accountId: 'rent', side: 'to', amount: null }
					]
				}
			)
		]);
		expect(
			occurrenceStatus(chartWith(pays('a', '2026-03-05', 999)), occ(varies), { today })
		).toMatchObject({ status: 'partly-paid', remaining: null });
	});

	it('is skipped, never overdue', () => {
		const skipped = plan([monthly], { occurrences: { '2026-03-05': { skipped: true } } });
		expect(occurrenceStatus(chartWith(), occ(skipped), { today })).toMatchObject({
			status: 'skipped',
			overdue: false
		});
	});
});

describe('plan edits', () => {
	const monthly = version({ type: 'monthly', day: 5, start: '2026-01-05' });
	const later = new Date('2026-03-10T08:00:00Z');
	const empty = buildChart([...roots], []);
	const paidChart = buildChart(
		[...roots, account('bpi', 'asset', 'asset'), account('rent', 'expense', 'expense')],
		[
			{
				...tx('a', '2026-03-05', [
					['bpi', -100000],
					['rent', 100000]
				]),
				pays: { plan: 'scheduled' as const, planId: 'p1', due: '2026-03-05' }
			}
		]
	);
	const saved = (writes: ChartWrite[]) => {
		const [w] = writes;
		if (w.op !== 'setScheduled') throw new Error(`expected setScheduled, got ${w.op}`);
		return w.data;
	};

	it('changes only this occurrence, and refuses a date the plan does not produce', () => {
		const p = plan([monthly]);
		const moved = saved(
			planChangeOccurrence(empty, p, '2026-03-05', { movedTo: '2026-03-07' }, { now: later })
		);
		expect(moved.occurrences).toEqual({ '2026-03-05': { movedTo: '2026-03-07' } });
		expect(moved.updatedAt).toBe(later);
		const skipped = saved(
			planChangeOccurrence(
				empty,
				{ ...p, ...moved },
				'2026-03-05',
				{ skipped: true },
				{ now: later }
			)
		);
		expect(skipped.occurrences['2026-03-05']).toEqual({ movedTo: '2026-03-07', skipped: true });
		expect(() =>
			planChangeOccurrence(empty, p, '2026-03-06', { skipped: true }, { now: later })
		).toThrow(/not an occurrence/);
	});

	it('marks paid only after at least one paying Transaction', () => {
		const p = plan([monthly]);
		expect(() =>
			planChangeOccurrence(empty, p, '2026-03-05', { settled: true }, { now: later })
		).toThrow(/Transaction/);
		expect(
			saved(planChangeOccurrence(paidChart, p, '2026-03-05', { settled: true }, { now: later }))
				.occurrences['2026-03-05']
		).toEqual({ settled: true });
	});

	it('changes this and all following: a new version from that date, later changes replaced', () => {
		const p = plan([monthly], {
			occurrences: {
				'2026-02-05': { skipped: true },
				'2026-04-05': { amounts: [null, 1300000, 1500] },
				'2026-05-05': { movedTo: '2026-05-06' }
			}
		});
		const { rule: _rule, from: _from, ...details } = monthly;
		const { writes, replaced } = planChangeFollowing(
			p,
			'2026-04-05',
			{
				...details,
				description: 'Rent, new rate',
				rule: { type: 'monthly', day: 10, start: '2026-04-10' }
			},
			{ now: later }
		);
		const data = saved(writes);
		expect(replaced).toBe(2);
		expect(data.versions.map((v) => [v.from, v.description])).toEqual([
			['2026-01-05', 'Plan'],
			['2026-04-05', 'Rent, new rate']
		]);
		expect(data.occurrences).toEqual({ '2026-02-05': { skipped: true } });
		expect(dues({ ...p, ...data }, '2026-03-01', '2026-05-31')).toEqual([
			'2026-03-05',
			'2026-04-10',
			'2026-05-10'
		]);
	});

	it('changes details on every version from the Plans list, rules untouched', () => {
		const p = plan([
			monthly,
			version({ type: 'monthly', day: 10, start: '2026-04-10' }, { from: '2026-04-05' })
		]);
		const data = saved(
			planChangeAll(
				p,
				{ description: 'House rent', note: '', tags: ['house'], lines: monthly.lines },
				{ now: later }
			)
		);
		expect(data.versions.map((v) => [v.description, v.rule])).toEqual([
			['House rent', monthly.rule],
			['House rent', { type: 'monthly', day: 10, start: '2026-04-10' }]
		]);
	});

	it('ends a plan today, and deletes it only while nothing pays it', () => {
		expect(saved(planEndPlan(plan([monthly]), { today: '2026-03-10', now: later })).end).toEqual({
			type: 'on',
			date: '2026-03-10'
		});
		expect(planDeletePlan(empty, 'p1')).toEqual([{ op: 'deleteScheduled', id: 'p1' }]);
		expect(() => planDeletePlan(paidChart, 'p1')).toThrow(/End it instead/);
	});
});
