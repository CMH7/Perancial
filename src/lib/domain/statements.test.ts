import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	cardPaymentPlans,
	planEndCardPaymentPlans,
	planSetStatementAmount,
	statementsOf,
	type StatementInput
} from './statements.ts';
import type { Installment, Scheduled, Transaction } from './schemas.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

// Made-up figures in centavos; the owner's real numbers never go in tests.
const accounts = (statementDay = 20, dueDay = 9) => [
	...roots,
	account('visa', 'liability', 'liability', { card: { statementDay, dueDay } }),
	account('bank', 'asset', 'asset'),
	account('food', 'expense', 'expense'),
	account('gadget', 'liability', 'liability')
];

const input = (txs: Transaction[], extra: Partial<StatementInput> = {}): StatementInput => ({
	chart: buildChart(accounts(), txs),
	scheduled: [],
	installments: [],
	statements: [],
	...extra
});

/** A card charge in storage sign: Expense up, Liability up (negative). */
const charge = (id: string, date: string, amount: number) =>
	tx(id, date, [
		['food', amount],
		['visa', -amount]
	]);

describe('statementsOf', () => {
	it('bills a charge in the Statement that closes on or after its date', () => {
		const [s] = statementsOf(input([charge('lunch', '2026-11-05', 100000)]), 'visa', {
			until: '2026-12-31',
			today: '2026-11-15'
		});
		expect(s).toMatchObject({
			from: '2026-10-21',
			statementDate: '2026-11-20',
			dueDate: '2026-12-09',
			computed: 100000
		});
		expect(s.charges.map((c) => c.key)).toEqual(['transaction:lunch']);
	});

	it('bills a charge on the Statement Date in it, and one a day later in the next', () => {
		const list = statementsOf(
			input([charge('on', '2026-11-20', 100), charge('after', '2026-11-21', 200)]),
			'visa',
			{ until: '2027-01-31', today: '2026-11-15' }
		);
		expect(list.map((s) => [s.statementDate, s.computed])).toEqual([
			['2026-11-20', 100],
			['2026-12-20', 200]
		]);
	});

	it('closes on the last day of a shorter month when the Statement Day is 31', () => {
		const chart = buildChart(
			[
				...roots,
				account('visa', 'liability', 'liability', { card: { statementDay: 31, dueDay: 25 } }),
				account('food', 'expense', 'expense')
			],
			[charge('feb', '2027-02-10', 100), charge('apr', '2027-04-30', 200)]
		);
		const list = statementsOf(input([], { chart }), 'visa', {
			until: '2027-05-31',
			today: '2027-01-01'
		});
		expect(list.map((s) => [s.from, s.statementDate, s.dueDate, s.computed])).toEqual([
			['2027-02-01', '2027-02-28', '2027-03-25', 100],
			['2027-03-01', '2027-03-31', '2027-04-25', 0],
			['2027-04-01', '2027-04-30', '2027-05-25', 200]
		]);
	});

	it('puts the Due Date in the same month when the Due Day comes after the Statement Day', () => {
		const chart = buildChart(
			[
				...roots,
				account('visa', 'liability', 'liability', { card: { statementDay: 5, dueDay: 25 } }),
				account('food', 'expense', 'expense')
			],
			[charge('lunch', '2026-11-03', 100)]
		);
		const [s] = statementsOf(input([], { chart }), 'visa', {
			until: '2026-12-31',
			today: '2026-11-15'
		});
		expect([s.statementDate, s.dueDate]).toEqual(['2026-11-05', '2026-11-25']);
	});

	it('plans the payment on the Pay-on day before the Due Date, never before the Statement Date', () => {
		const card = (terms: { statementDay: number; dueDay: number; payDay?: number }) =>
			buildChart(
				[
					...roots,
					account('visa', 'liability', 'liability', { card: terms }),
					account('food', 'expense', 'expense')
				],
				[charge('lunch', '2026-11-03', 100)]
			);
		const first = (terms: Parameters<typeof card>[0]) =>
			statementsOf(input([], { chart: card(terms) }), 'visa', {
				until: '2026-12-31',
				today: '2026-11-15'
			})[0];
		expect(first({ statementDay: 5, dueDay: 24, payDay: 15 })).toMatchObject({
			statementDate: '2026-11-05',
			payDate: '2026-11-15',
			dueDate: '2026-11-24'
		});
		expect(first({ statementDay: 5, dueDay: 24 }).payDate).toBe('2026-11-24');
		// The 15th before 9 Dec is 15 Nov, before the 20 Nov Statement Date: pay on the Due Date.
		expect(first({ statementDay: 20, dueDay: 9, payDay: 15 })).toMatchObject({
			payDate: '2026-12-09',
			dueDate: '2026-12-09'
		});
	});

	it('lowers the Statement Balance by a refund, but not by a payment', () => {
		const refund = tx('refund', '2026-11-08', [
			['visa', 30000],
			['food', -30000]
		]);
		const payment = tx('pay', '2026-11-10', [
			['visa', 50000],
			['bank', -50000]
		]);
		const [s] = statementsOf(
			input([charge('lunch', '2026-11-05', 100000), refund, payment]),
			'visa',
			{ until: '2026-12-31', today: '2026-11-15' }
		);
		expect(s.computed).toBe(70000);
		expect(s.refunds.map((r) => [r.key, r.amount])).toEqual([['transaction:refund', 30000]]);
	});

	it('bills a charge on its billOn day instead of its date', () => {
		const late = { ...charge('late', '2026-11-18', 100), billOn: '2026-11-25' };
		const list = statementsOf(input([late]), 'visa', { until: '2027-01-31', today: '2026-11-15' });
		expect(list.map((s) => [s.statementDate, s.computed])).toEqual([['2026-12-20', 100]]);
	});

	const pay = (id: string, date: string, amount: number) =>
		tx(id, date, [
			['visa', amount],
			['bank', -amount]
		]);
	const nov = charge('nov', '2026-11-05', 10000);
	const dec = charge('dec', '2026-12-05', 20000);
	const jan = charge('jan', '2027-01-05', 5000);
	const opts = { until: '2027-02-28', today: '2026-12-15' };

	it('spreads one payment across Statements, oldest first', () => {
		const list = statementsOf(input([nov, dec, pay('p', '2026-12-08', 15000)]), 'visa', opts);
		expect(list.map((s) => [s.statementDate, s.paid, s.remaining, s.status])).toEqual([
			['2026-11-20', 10000, 0, 'paid'],
			['2026-12-20', 5000, 15000, 'partly-paid'],
			['2027-01-20', 0, 0, 'paid']
		]);
	});

	it('names the payments that filled each Statement, and how much of each', () => {
		const list = statementsOf(
			input([nov, dec, pay('p1', '2026-12-08', 15000), pay('p2', '2026-12-10', 3000)]),
			'visa',
			opts
		);
		expect(list.map((s) => s.payments)).toEqual([
			[{ txId: 'p1', amount: 10000 }],
			[
				{ txId: 'p1', amount: 5000 },
				{ txId: 'p2', amount: 3000 }
			],
			[]
		]);
	});

	it('carries an overpayment to the next Statement', () => {
		const list = statementsOf(input([nov, dec, jan, pay('p', '2026-12-08', 32000)]), 'visa', opts);
		expect(list.map((s) => [s.statementDate, s.paid, s.status])).toEqual([
			['2026-11-20', 10000, 'paid'],
			['2026-12-20', 20000, 'paid'],
			['2027-01-20', 2000, 'partly-paid']
		]);
	});

	it('carries a refund larger than its Statement to the next one', () => {
		const refund = tx('refund', '2026-12-06', [
			['visa', 25000],
			['food', -25000]
		]);
		const list = statementsOf(
			input([nov, dec, jan, refund, pay('p', '2026-12-08', 10000)]),
			'visa',
			opts
		);
		expect(list.map((s) => [s.statementDate, s.computed, s.remaining, s.status])).toEqual([
			['2026-11-20', 10000, 0, 'paid'],
			['2026-12-20', -5000, 0, 'paid'],
			['2027-01-20', 5000, 0, 'paid']
		]);
	});

	it('uses the amount entered from the real Statement, and shows its gap from the sum', () => {
		const entered = {
			id: 'visa_2026-11-20',
			cardId: 'visa',
			statementDate: '2026-11-20',
			amount: 12500,
			sources: [],
			createdAt: now,
			updatedAt: now
		};
		const [s] = statementsOf(
			input([nov, pay('p', '2026-12-08', 10000)], { statements: [entered] }),
			'visa',
			{
				until: '2026-12-31',
				today: '2026-12-15'
			}
		);
		expect(s).toMatchObject({
			computed: 10000,
			entered: 12500,
			balance: 12500,
			gap: 2500,
			remaining: 2500,
			status: 'partly-paid'
		});
	});

	it('is estimated until an amount is entered', () => {
		const [s] = statementsOf(input([nov]), 'visa', { until: '2026-12-31', today: '2026-12-15' });
		expect(s).toMatchObject({ entered: null, balance: 10000, gap: null });
	});

	it('carries the Opening Balance into the first Statement, so payments clear it first', () => {
		const list = statementsOf(
			input([opening('visa', -8000), nov, pay('p', '2026-12-08', 8000)]),
			'visa',
			{
				until: '2026-12-31',
				today: '2026-12-15'
			}
		);
		expect(list.map((s) => [s.statementDate, s.carried, s.computed, s.remaining])).toEqual([
			['2026-11-20', 8000, 18000, 10000]
		]);
	});

	describe('planned charges', () => {
		const subscription: Scheduled = {
			id: 'sub',
			versions: [
				{
					from: '2026-10-30',
					description: 'Subscription',
					note: '',
					tags: [],
					lines: [
						{ accountId: 'visa', side: 'from', amount: 14100 },
						{ accountId: 'food', side: 'to', amount: 14100 }
					],
					rule: { type: 'monthly', day: 30, start: '2026-10-30' }
				}
			],
			end: { type: 'never' },
			occurrences: {},
			createdAt: now,
			updatedAt: now
		};
		const rows = (dates: string[]) =>
			dates.map((due, i) => ({
				n: i + 1,
				due,
				date: due,
				principal: 50000,
				interest: 0,
				additionals: []
			}));
		const gadget: Installment = {
			id: 'gadget-plan',
			kind: 'lender',
			title: 'Gadget',
			note: '',
			tags: [],
			purchaseDate: '2026-11-01',
			entry: 'flat',
			rule: { type: 'monthly', day: 10, start: '2026-12-10' },
			trackedFrom: 1,
			accounts: { repaid: 'gadget', paying: 'visa', interest: null, fees: null },
			rows: rows(['2026-12-10', '2027-01-10']),
			createdAt: now,
			updatedAt: now
		};
		const keys = (list: ReturnType<typeof statementsOf>) =>
			list.map((s) => [s.statementDate, s.charges.map((c) => `${c.key} ${c.amount}`)]);

		it('bill unrecorded Occurrences in Statements that close today or later', () => {
			const list = statementsOf(input([], { scheduled: [subscription] }), 'visa', opts);
			expect(keys(list)).toEqual([
				['2026-12-20', ['scheduled:sub:2026-11-30 14100']],
				['2027-01-20', ['scheduled:sub:2026-12-30 14100']]
			]);
		});

		it('bill only what is still planned beyond a partly recorded Occurrence', () => {
			const part = {
				...charge('part', '2026-11-30', 10000),
				pays: { plan: 'scheduled' as const, planId: 'sub', due: '2026-11-30' }
			};
			const [s] = statementsOf(input([part], { scheduled: [subscription] }), 'visa', opts);
			expect(keys([s])).toEqual([
				['2026-12-20', ['transaction:part 10000', 'scheduled:sub:2026-11-30 4100']]
			]);
		});

		it('bill unpaid Installment Rows paid by the card on their Row date', () => {
			const row1 = {
				...tx('row1', '2026-12-10', [
					['gadget', 50000],
					['visa', -50000]
				]),
				pays: { plan: 'installment' as const, planId: 'gadget-plan', due: '2026-12-10' }
			};
			const list = statementsOf(input([row1], { installments: [gadget] }), 'visa', opts);
			expect(keys(list)).toEqual([
				['2026-12-20', ['transaction:row1 50000']],
				['2027-01-20', ['installment:gadget-plan:2027-01-10 50000']]
			]);
		});
	});
});

describe('planSetStatementAmount', () => {
	const stored = {
		id: 'visa_2026-11-20',
		cardId: 'visa',
		statementDate: '2026-11-20',
		amount: null,
		sources: [{ accountId: 'bank', amount: 5000 }],
		createdAt: new Date('2026-11-01T00:00:00Z'),
		updatedAt: new Date('2026-11-01T00:00:00Z')
	};

	it('writes the entered amount, keeping the Statement’s Paying sources', () => {
		expect(planSetStatementAmount([stored], 'visa', '2026-11-20', 12500, { now })).toEqual([
			{
				op: 'setStatement',
				id: 'visa_2026-11-20',
				data: {
					amount: 12500,
					sources: stored.sources,
					createdAt: stored.createdAt,
					updatedAt: now
				}
			}
		]);
	});

	it('starts a new Statement document with no sources, and clears an amount with null', () => {
		expect(planSetStatementAmount([], 'visa', '2026-12-20', null, { now })).toEqual([
			{
				op: 'setStatement',
				id: 'visa_2026-12-20',
				data: { amount: null, sources: [], createdAt: now, updatedAt: now }
			}
		]);
	});
});

describe('card payment plans', () => {
	const terms = { statementDay: 20, dueDay: 9 };
	const payPlan = (
		id: string,
		lines: Scheduled['versions'][0]['lines'],
		extra: Partial<Scheduled> = {}
	): Scheduled => ({
		id,
		versions: [
			{
				from: '2026-10-09',
				description: id,
				note: '',
				tags: [],
				lines,
				rule: { type: 'monthly', day: 9, start: '2026-10-09' }
			}
		],
		end: { type: 'never' },
		occurrences: { '2026-11-09': { amounts: [5000, 5000] } },
		createdAt: now,
		updatedAt: now,
		...extra
	});
	const payCard = payPlan('pay', [
		{ accountId: 'bank', side: 'from', amount: null },
		{ accountId: 'visa', side: 'to', amount: null }
	]);
	const ended = payPlan(
		'ended',
		[
			{ accountId: 'bank', side: 'from', amount: null },
			{ accountId: 'visa', side: 'to', amount: null }
		],
		{ end: { type: 'on', date: '2026-11-30' } }
	);
	const chargeOnCard = payPlan('charge', [
		{ accountId: 'visa', side: 'from', amount: 100 },
		{ accountId: 'food', side: 'to', amount: 100 }
	]);
	const fromLoan = payPlan('from-loan', [
		{ accountId: 'gadget', side: 'from', amount: 100 },
		{ accountId: 'visa', side: 'to', amount: 100 }
	]);
	const plans = {
		chart: buildChart(accounts(), []),
		scheduled: [payCard, ended, chargeOnCard, fromLoan]
	};

	it('finds plans that still pay the card from an Asset on or after its next Due Date', () => {
		expect(
			cardPaymentPlans(plans, 'visa', terms, { today: '2026-11-25' }).map((p) => [
				p.plan.id,
				p.endOn
			])
		).toEqual([['pay', '2026-12-08']]);
	});

	it('looks to the following Statement once this Due Date has passed', () => {
		expect(
			cardPaymentPlans(plans, 'visa', terms, { today: '2026-12-15' }).map((p) => p.endOn)
		).toEqual(['2027-01-08']);
	});

	it('ends each plan the day before the next Due Date, keeping earlier Occurrences', () => {
		const found = cardPaymentPlans(plans, 'visa', terms, { today: '2026-11-25' });
		const later = new Date('2026-11-25T00:00:00Z');
		expect(planEndCardPaymentPlans(found, { now: later })).toEqual([
			{
				op: 'setScheduled',
				id: 'pay',
				data: expect.objectContaining({
					end: { type: 'on', date: '2026-12-08' },
					occurrences: payCard.occurrences,
					updatedAt: later
				})
			}
		]);
	});
});
