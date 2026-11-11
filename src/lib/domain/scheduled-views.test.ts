import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import type { PlanVersion, Scheduled, Transaction } from './schemas.ts';
import {
	describeRule,
	evaluatePlanDraft,
	nextOccurrence,
	planCreatePlan,
	planDraftFrom,
	planHistory,
	upcoming,
	type PlanDraft
} from './scheduled-views.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const lines: PlanVersion['lines'] = [
	{ accountId: 'bpi', side: 'from', amount: null },
	{ accountId: 'rent', side: 'to', amount: 1200000 }
];
const plan = (id: string, day: number, extra: Partial<Scheduled> = {}): Scheduled => ({
	id,
	versions: [
		{
			from: `2026-10-${String(day).padStart(2, '0')}`,
			description: id,
			note: '',
			tags: [],
			lines,
			rule: { type: 'monthly', day, start: `2026-10-${String(day).padStart(2, '0')}` }
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now,
	...extra
});
const pays = (id: string, planId: string, due: string, amount: number): Transaction => ({
	...tx(id, due, [
		['bpi', -amount],
		['rent', amount]
	]),
	pays: { plan: 'scheduled', planId, due }
});
const accounts = [
	...roots,
	account('banks', 'asset', 'asset'),
	account('bpi', 'asset', 'banks'),
	account('rent', 'expense', 'expense'),
	account('card', 'liability', 'liability'),
	account('bank-fees', 'expense', 'expense'),
	account('old', 'asset', 'asset', { archived: true })
];
const today = '2026-11-10';

describe('upcoming', () => {
	it('puts overdue first, oldest first, then the next 30 days; paid and skipped left out', () => {
		const rent = plan('rent', 5, { occurrences: { '2026-12-05': { skipped: true } } });
		const water = plan('water', 20);
		const chart = buildChart(accounts, [
			pays('t1', 'rent', '2026-10-05', 1200000),
			pays('t2', 'water', '2026-10-20', 500000)
		]);
		expect(
			upcoming(chart, [rent, water], { today }).map((u) => [
				u.occurrence.planId,
				u.occurrence.due,
				u.status.status,
				u.status.overdue
			])
		).toEqual([
			['water', '2026-10-20', 'partly-paid', true],
			['rent', '2026-11-05', 'unpaid', true],
			['water', '2026-11-20', 'unpaid', false]
		]);
	});
});

describe('planHistory and nextOccurrence', () => {
	it('lists past occurrences newest first with status and payments', () => {
		const rent = plan('rent', 5, { occurrences: { '2026-11-05': { skipped: true } } });
		const chart = buildChart(accounts, [pays('t1', 'rent', '2026-10-05', 1200000)]);
		expect(
			planHistory(chart, rent, { today }).map((h) => [
				h.occurrence.due,
				h.status.status,
				h.status.payments.map((p) => p.id)
			])
		).toEqual([
			['2026-11-05', 'skipped', []],
			['2026-10-05', 'paid', ['t1']]
		]);
	});

	it('finds the next unskipped date from today, none once ended', () => {
		const rent = plan('rent', 5, { occurrences: { '2026-12-05': { skipped: true } } });
		expect(nextOccurrence(rent, { today })?.date).toBe('2027-01-05');
		expect(
			nextOccurrence({ ...rent, end: { type: 'on', date: '2026-11-30' } }, { today })
		).toBeUndefined();
	});
});

const draft = (patch: Partial<PlanDraft> = {}): PlanDraft => ({
	description: 'Rent',
	note: '',
	tags: [],
	from: [{ accountId: 'bpi', amount: '' }],
	to: [{ accountId: 'rent', amount: '12,000' }],
	fees: [],
	rule: { type: 'monthly', day: 5, start: '2026-12-05' },
	end: { type: 'never' },
	...patch
});
const at = (d: PlanDraft) => evaluatePlanDraft(buildChart(accounts, []), d).errors.map((e) => e.at);

describe('evaluatePlanDraft', () => {
	it('allows several blank amounts, checking totals only when every amount is filled', () => {
		expect(at(draft({ to: [{ accountId: 'rent', amount: '' }] }))).toEqual([]);
		expect(at(draft({ from: [{ accountId: 'bpi', amount: '11,000' }] }))).toEqual(['total']);
		expect(at(draft({ from: [{ accountId: 'bpi', amount: '12,000' }] }))).toEqual([]);
		expect(at(draft({ to: [{ accountId: 'rent', amount: '-5' }] }))).toEqual(['to.0.amount']);
	});

	it('checks Accounts like the Transaction form, and the Description, rule and end', () => {
		expect(at(draft({ to: [{ accountId: 'banks', amount: '' }] }))).toEqual(['to.0.account']);
		expect(at(draft({ to: [{ accountId: 'old', amount: '' }] }))).toEqual(['to.0.account']);
		expect(at(draft({ description: ' ' }))).toEqual(['description']);
		expect(at(draft({ rule: { type: 'monthly', day: 0, start: '2026-12-05' } }))).toEqual(['rule']);
		expect(at(draft({ rule: { type: 'weekly', every: 2, start: '' } }))).toEqual(['rule']);
		expect(at(draft({ end: { type: 'on', date: '2026-12-01' } }))).toEqual(['end']);
		expect(at(draft({ end: { type: 'after', count: 0 } }))).toEqual(['end']);
	});
});

describe('planCreatePlan and planDraftFrom', () => {
	const chart = buildChart(accounts, []);

	it('keeps the Forecast Section through create and edit', () => {
		const [w] = planCreatePlan(chart, draft({ section: 'important' }), { id: 'p9', now });
		if (w.op !== 'setScheduled') throw new Error('expected a plan');
		expect(w.data.section).toBe('important');
		expect(planDraftFrom({ id: 'p9', ...w.data }).section).toBe('important');
		const [plain] = planCreatePlan(chart, draft(), { id: 'p8', now });
		expect(plain.op === 'setScheduled' && 'section' in plain.data).toBe(false);
	});

	it('writes a plan whose first version starts with the rule, lines From, To, then fees', () => {
		const writes = planCreatePlan(
			chart,
			draft({
				tags: ['House'],
				fees: [{ accountId: 'bank-fees', amount: '15', mode: 'additional' }]
			}),
			{ id: 'p9', now }
		);
		expect(writes).toEqual([
			{
				op: 'setScheduled',
				id: 'p9',
				data: {
					versions: [
						{
							from: '2026-12-05',
							description: 'Rent',
							note: '',
							tags: ['house'],
							lines: [
								{ accountId: 'bpi', side: 'from', amount: null },
								{ accountId: 'rent', side: 'to', amount: 1200000 },
								{ accountId: 'bank-fees', side: 'to', amount: 1500, fee: 'additional' }
							],
							rule: { type: 'monthly', day: 5, start: '2026-12-05' }
						}
					],
					end: { type: 'never' },
					occurrences: {},
					createdAt: now,
					updatedAt: now
				}
			}
		]);
		expect(() => planCreatePlan(chart, draft({ description: '' }), { id: 'p9', now })).toThrow(
			/Description/
		);
	});

	it('fills the editor from the version in force on a date', () => {
		const [w] = planCreatePlan(
			chart,
			draft({ fees: [{ accountId: 'bank-fees', amount: '15', mode: 'additional' }] }),
			{ id: 'p9', now }
		);
		const saved = { id: 'p9', ...(w.op === 'setScheduled' ? w.data : ({} as never)) } as Scheduled;
		const later = {
			...saved,
			versions: [
				...saved.versions,
				{ ...saved.versions[0], from: '2027-03-05', description: 'Rent, new rate' }
			]
		};
		expect(planDraftFrom(later, '2027-01-05')).toEqual(
			draft({
				to: [{ accountId: 'rent', amount: '12000.00' }],
				fees: [{ accountId: 'bank-fees', amount: '15.00', mode: 'additional' }]
			})
		);
		expect(planDraftFrom(later).description).toBe('Rent, new rate');
	});
});

describe('describeRule', () => {
	it('says each rule in words', () => {
		expect(describeRule({ type: 'once', date: '2026-12-01' })).toBe('Once, on 1 Dec 2026');
		expect(describeRule({ type: 'cutoff', start: '2026-01-15' })).toBe(
			'Every cut-off (15th and 30th)'
		);
		expect(describeRule({ type: 'monthly', day: 5, start: '2026-01-05' })).toBe(
			'Monthly on the 5th'
		);
		expect(describeRule({ type: 'monthly', day: 31, start: '2026-01-31' })).toBe(
			'Monthly on the 31st (or the last day)'
		);
		expect(describeRule({ type: 'weekly', every: 1, start: '2026-11-06' })).toBe(
			'Every week on Friday'
		);
		expect(describeRule({ type: 'weekly', every: 2, start: '2026-11-06' })).toBe(
			'Every 2 weeks on Friday'
		);
		expect(describeRule({ type: 'yearly', start: '2026-03-01' })).toBe('Yearly on 1 Mar');
	});
});

describe('A card payment whose amount varies', () => {
	// Pays the card on the 9th; the amount is whatever was charged since the last payment.
	const cardPay = plan('cardpay', 9, {
		versions: [
			{
				from: '2026-10-09',
				description: 'Pay card',
				note: '',
				tags: [],
				lines: [
					{ accountId: 'bpi', side: 'from', amount: null },
					{ accountId: 'card', side: 'to', amount: null }
				],
				rule: { type: 'monthly', day: 9, start: '2026-10-09' }
			}
		]
	});
	const soa = tx('soa', '2026-10-20', [
		['rent', 3_167_813],
		['card', -3_167_813]
	]);
	const paid = (amount: number) => ({
		...tx('pay', '2026-11-07', [
			['bpi', -amount],
			['card', amount]
		]),
		pays: { plan: 'scheduled' as const, planId: 'cardpay', due: '2026-11-09' }
	});
	const context = { scheduled: [cardPay], installments: [] };

	it('is Paid once its payments cover what was charged, as on the Forecast', () => {
		const chart = buildChart(accounts, [soa, paid(3_167_813)]);
		const nov = planHistory(chart, cardPay, { today, ...context }).find(
			(h) => h.occurrence.due === '2026-11-09'
		)!;
		expect(nov.status).toMatchObject({ status: 'paid', remaining: 0, overdue: false });
		expect(
			upcoming(chart, [cardPay], { today, installments: [] }).map((u) => u.occurrence.due)
		).not.toContain('2026-11-09');
	});

	it('is Partly paid while short of what was charged', () => {
		const chart = buildChart(accounts, [soa, paid(1_000_000)]);
		const nov = planHistory(chart, cardPay, { today, ...context }).find(
			(h) => h.occurrence.due === '2026-11-09'
		)!;
		expect(nov.status).toMatchObject({ status: 'partly-paid', remaining: 2_167_813 });
	});
});
