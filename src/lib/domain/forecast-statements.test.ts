import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { buildForecast, laterPayments, type ForecastInput } from './forecast.ts';
import { planBillWithPayment } from './forecast-add.ts';
import { planSetSources } from './forecast-sources.ts';
import { forecastRecordDraft, recordQuery } from './forecast-record.ts';
import { plannedCharges } from './forecast-charges.ts';
import { statementRecordDraft } from './statements.ts';
import type { Scheduled, Statement, Transaction } from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

// Made-up figures in centavos; the owner's real numbers never go in tests.
const accounts = [
	...roots,
	account('visa', 'liability', 'liability', {
		name: 'Visa',
		card: { statementDay: 20, dueDay: 9 }
	}),
	account('bank', 'asset', 'asset'),
	account('wallet', 'asset', 'asset'),
	account('food', 'expense', 'expense')
];

const charge = (id: string, date: string, amount: number) =>
	tx(id, date, [
		['food', amount],
		['visa', -amount]
	]);
const pay = (id: string, date: string, amount: number, from = 'bank') =>
	tx(id, date, [
		['visa', amount],
		[from, -amount]
	]);

function input(txs: Transaction[], over: Partial<ForecastInput> = {}): ForecastInput {
	return {
		chart: buildChart(accounts, txs),
		scheduled: [],
		installments: [],
		forecasts: [
			{ id: '2026-11-15', fundingAccounts: ['bank', 'wallet'], createdAt: now, updatedAt: now }
		],
		statements: [],
		settings: null,
		today: '2026-11-25',
		...over
	};
}

/** The Statement closing 20 Nov is due 9 Dec: funded by the 15 Dec Cut-off. */
const DEC_15 = '2026-12-15';

describe('Credit Card Statements in a Forecast', () => {
	it('are one Outflow each, in the Cut-off holding the Due Date, under the card', () => {
		const view = buildForecast(input([charge('lunch', '2026-11-05', 50000)]), DEC_15);
		const [o] = view.outflows;
		expect(o).toMatchObject({
			key: 'statement:visa:2026-11-20',
			link: { plan: 'statement', planId: 'visa', due: '2026-11-20' },
			date: '2026-12-09',
			total: 50000,
			kind: 'liability',
			liabilityId: 'visa',
			section: { key: 'liability:visa', name: 'Visa', kind: 'liability' },
			status: 'unpaid',
			statement: { cardId: 'visa', statementDate: '2026-11-20', entered: null, gap: null }
		});
		expect(o.charges?.map((c) => [c.key, c.amount])).toEqual([['transaction:lunch', 50000]]);
	});

	it('fall in the Cut-off of the card’s Pay-on day, still due and overdue by the Due Date', () => {
		const chart = buildChart(
			[
				...accounts,
				account('mc', 'liability', 'liability', {
					name: 'MC',
					card: { statementDay: 5, dueDay: 24, payDay: 15 }
				})
			],
			[
				tx('dinner', '2026-11-03', [
					['food', 30000],
					['mc', -30000]
				])
			]
		);
		const at = (cutoff: string) =>
			buildForecast(input([], { chart, today: '2026-11-10' }), cutoff).outflows.filter(
				(o) => o.liabilityId === 'mc'
			);
		expect(at('2026-11-15')).toMatchObject([
			{ key: 'statement:mc:2026-11-05', date: '2026-11-15', overdue: false }
		]);
		expect(at('2026-11-30')).toEqual([]);
	});

	it('count a card payment from a Funding Account as paying the Statement, never as Unplanned', () => {
		// The 20 Nov Statement is due 9 Dec; paid on 5 Dec from the bank, in the 15 Dec Cut-off.
		const view = buildForecast(
			input([charge('lunch', '2026-11-05', 50000), pay('p', '2026-12-05', 50000)], {
				forecasts: [{ id: DEC_15, fundingAccounts: ['bank'], createdAt: now, updatedAt: now }],
				today: '2026-12-06'
			}),
			DEC_15
		);
		expect(view.outflows[0]).toMatchObject({ status: 'paid', paid: 50000 });
		expect(view.lanes.find((l) => l.accountId === 'bank')!.unplanned).toEqual([]);
	});

	const entered = (amount: number | null, sources: Statement['sources'] = []): Statement => ({
		id: 'visa_2026-11-20',
		cardId: 'visa',
		statementDate: '2026-11-20',
		amount,
		sources,
		createdAt: now,
		updatedAt: now
	});

	it('use the amount entered from the real Statement, showing the gap from the sum', () => {
		const view = buildForecast(
			input([charge('lunch', '2026-11-05', 50000)], { statements: [entered(52000)] }),
			DEC_15
		);
		expect(view.outflows[0]).toMatchObject({
			total: 52000,
			statement: { computed: 50000, entered: 52000, gap: 2000 }
		});
	});

	it('are paid by payments into the card, from the Account of the latest payment by default', () => {
		const txs = [
			pay('old', '2026-10-25', 1000, 'wallet'),
			charge('earlier', '2026-10-10', 1000),
			charge('lunch', '2026-11-05', 50000),
			pay('p', '2026-11-28', 20000, 'wallet')
		];
		const [o] = buildForecast(input(txs, { today: '2026-11-30' }), DEC_15).outflows;
		expect(o).toMatchObject({ status: 'partly-paid', paid: 20000, remaining: 30000 });
		expect(o.sources).toEqual([{ accountId: 'wallet', amount: 50000, paid: 20000, valid: true }]);
	});

	it('keep the Paying sources stored on the Statement', () => {
		const view = buildForecast(
			input([charge('lunch', '2026-11-05', 50000)], {
				statements: [entered(null, [{ accountId: 'bank', amount: 50000 }])]
			}),
			DEC_15
		);
		expect(view.outflows[0].sources.map((s) => [s.accountId, s.amount])).toEqual([['bank', 50000]]);
		expect(view.outflows[0].statement?.entered).toBeNull();
	});

	it('carry over to today’s Forecast while unpaid after their Cut-off', () => {
		const view = buildForecast(
			input([charge('lunch', '2026-11-05', 50000)], { today: '2026-12-20' }),
			'2026-12-30'
		);
		expect(view.outflows.find((o) => o.key === 'statement:visa:2026-11-20')).toMatchObject({
			carried: 'in',
			overdue: true,
			section: { key: 'overdue' }
		});
	});

	it('show as Paid once paid, and make no Outflow when nothing is owed', () => {
		const txs = [charge('lunch', '2026-11-05', 50000), pay('p', '2026-11-10', 50000)];
		expect(buildForecast(input(txs), DEC_15).outflows.map((o) => o.status)).toEqual(['paid']);
		const refunded = [
			charge('lunch', '2026-11-05', 50000),
			tx('refund', '2026-11-06', [
				['visa', 50000],
				['food', -50000]
			])
		];
		expect(buildForecast(input(refunded), DEC_15).outflows).toEqual([]);
	});

	it('bill a planned charge into an Asset (someone will pay it back) as a charge, never an Inflow', () => {
		const chart = buildChart(
			[...accounts, account('owed', 'asset', 'asset', { name: 'Owed by employer' })],
			[]
		);
		const reimbursable: Scheduled = {
			id: 'team',
			versions: [
				{
					from: '2026-11-02',
					description: 'Team plan',
					note: '',
					tags: [],
					lines: [
						{ accountId: 'visa', side: 'from', amount: 25000 },
						{ accountId: 'owed', side: 'to', amount: 25000 }
					],
					rule: { type: 'monthly', day: 2, start: '2026-11-02' }
				}
			],
			end: { type: 'never' },
			occurrences: {},
			createdAt: now,
			updatedAt: now
		};
		const base = input([], { chart, scheduled: [reimbursable], today: '2026-11-01' });
		expect(buildForecast(base, '2026-11-15').inflows).toEqual([]);
		const [o] = buildForecast(base, DEC_15).outflows;
		expect(o.key).toBe('statement:visa:2026-11-20');
		expect(o.charges?.map((c) => [c.key, c.amount])).toEqual([
			['scheduled:team:2026-11-02', 25000]
		]);
	});

	it('leave a leftover card payment plan without the card’s charges', () => {
		const leftover: Scheduled = {
			id: 'old-pay',
			versions: [
				{
					from: '2026-12-09',
					description: 'Old card payment',
					note: '',
					tags: [],
					lines: [
						{ accountId: 'bank', side: 'from', amount: null },
						{ accountId: 'visa', side: 'to', amount: null }
					],
					rule: { type: 'once', date: '2026-12-09' }
				}
			],
			end: { type: 'never' },
			occurrences: {},
			createdAt: now,
			updatedAt: now
		};
		const view = buildForecast(
			input([charge('lunch', '2026-11-05', 50000)], { scheduled: [leftover] }),
			DEC_15
		);
		const old = view.outflows.find((o) => o.key === 'scheduled:old-pay:2026-12-09');
		expect(old?.charges).toBeUndefined();
		expect(old?.total).toBe(0);
	});
});

describe('Paying sources of a Statement', () => {
	it('are saved on its Statement document, keeping an entered amount', () => {
		const stored: Statement = {
			id: 'visa_2026-11-20',
			cardId: 'visa',
			statementDate: '2026-11-20',
			amount: 52000,
			sources: [],
			createdAt: new Date('2026-11-21T00:00:00Z'),
			updatedAt: new Date('2026-11-21T00:00:00Z')
		};
		const base = input([charge('lunch', '2026-11-05', 50000)], { statements: [stored] });
		const [o] = buildForecast(base, DEC_15).outflows;
		const later = new Date('2026-11-25T00:00:00Z');
		expect(planSetSources(base, DEC_15, o, [{ accountId: 'bank', amount: 52000 }], later)).toEqual([
			{
				op: 'setStatement',
				id: 'visa_2026-11-20',
				data: {
					amount: 52000,
					sources: [{ accountId: 'bank', amount: 52000 }],
					createdAt: stored.createdAt,
					updatedAt: later
				}
			}
		]);
	});
});

describe('Recording a Statement payment', () => {
	it('pays the card from the picked sources, with no paid link', () => {
		const chart = buildChart(accounts, [charge('lunch', '2026-11-05', 50000)]);
		const base = statementRecordDraft(chart, 'visa', 50000, { today: '2026-11-25' });
		expect(base).toEqual({
			date: '2026-11-25',
			description: 'Visa payment',
			note: '',
			status: 'cleared',
			tags: [],
			from: [{ accountId: '', amount: '' }],
			to: [{ accountId: 'visa', amount: '500.00' }],
			fees: []
		});
		expect(
			forecastRecordDraft(base, [
				{ accountId: 'bank', amount: 30000 },
				{ accountId: 'wallet', amount: 20000 }
			])
		).toMatchObject({
			from: [
				{ accountId: 'bank', amount: '300.00' },
				{ accountId: 'wallet', amount: '200.00' }
			],
			to: [{ accountId: 'visa', amount: '500.00' }]
		});
	});

	it('offers the Statement’s planned charges to record with it', () => {
		const subscription: Scheduled = {
			id: 'sub',
			versions: [
				{
					from: '2026-11-25',
					description: 'Subscription',
					note: '',
					tags: [],
					lines: [
						{ accountId: 'visa', side: 'from', amount: 14100 },
						{ accountId: 'food', side: 'to', amount: 14100 }
					],
					rule: { type: 'monthly', day: 25, start: '2026-11-25' }
				}
			],
			end: { type: 'never' },
			occurrences: {},
			createdAt: now,
			updatedAt: now
		};
		const chargeInput = {
			chart: buildChart(accounts, [charge('lunch', '2026-11-05', 50000)]),
			scheduled: [subscription],
			installments: []
		};
		// 25 Nov is after the 20 Nov Statement Date: it bills in the Statement due 9 Jan, not 9 Dec.
		const at = (due: string) =>
			plannedCharges(chargeInput, 'visa', due, { today: '2026-11-15' }).map((c) => [
				c.key,
				c.amount
			]);
		expect(at('2026-12-09')).toEqual([]);
		expect(at('2027-01-09')).toEqual([['scheduled:sub:2026-11-25', 14100]]);
	});
});

describe('Billing a card charge with a later Statement', () => {
	it('offers the later Statements’ Due Dates', () => {
		const base = input([charge('lunch', '2026-11-05', 50000)]);
		expect(laterPayments(base, 'visa', '2026-12-09').slice(0, 2)).toEqual([
			'2027-01-09',
			'2027-02-09'
		]);
	});

	it('bills the charge from the first day of the chosen Statement', () => {
		const base = input([charge('lunch', '2026-11-05', 50000)]);
		const [o] = buildForecast(base, DEC_15).outflows;
		const writes = planBillWithPayment(base, o.charges!, 'visa', '2027-02-09', now);
		expect(writes).toEqual([
			{ op: 'setTransaction', id: 'lunch', data: expect.objectContaining({ billOn: '2026-12-21' }) }
		]);
	});
});

describe('The Record link', () => {
	it('names the plan and due date, or the card and Statement Date', () => {
		expect(recordQuery({ plan: 'scheduled', planId: 'rent', due: '2026-12-05' })).toBe(
			'plan=rent&due=2026-12-05'
		);
		expect(recordQuery({ plan: 'installment', planId: 'gadget', due: '2026-12-05' })).toBe(
			'installment=gadget&due=2026-12-05'
		);
		expect(recordQuery({ plan: 'statement', planId: 'visa', due: '2026-11-20' })).toBe(
			'card=visa&statement=2026-11-20'
		);
	});
});
