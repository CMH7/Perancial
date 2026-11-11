import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { oneOffDraft, planBillLater, planBillWithPayment } from './forecast-add.ts';
import { laterPayments, type Charge, type ForecastInput } from './forecast.ts';
import type { Installment, Scheduled } from './schemas.ts';
import { planCreatePlan } from './scheduled-views.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const accounts = [
	...roots,
	account('everyday', 'asset', 'asset'),
	account('friend', 'asset', 'asset'),
	account('card', 'liability', 'liability'),
	account('loan', 'liability', 'liability'),
	account('food', 'expense', 'expense'),
	account('finance', 'expense', 'expense')
];
const buffet = tx('buffet', '2026-11-09', [
	['food', 159_800],
	['card', -159_800]
]);
const music: Scheduled = {
	id: 'music',
	versions: [
		{
			from: '2026-10-12',
			description: 'Music',
			note: '',
			tags: [],
			lines: [
				{ accountId: 'card', side: 'from', amount: 15_000 },
				{ accountId: 'food', side: 'to', amount: 15_000 }
			],
			rule: { type: 'monthly', day: 12, start: '2026-10-12' }
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now
};
const cardRows: Installment = {
	id: 'laptop',
	kind: 'lender',
	title: 'Laptop',
	note: '',
	tags: [],
	purchaseDate: '2026-10-01',
	entry: 'flat',
	rule: { type: 'monthly', day: 20, start: '2026-11-20' },
	trackedFrom: 1,
	accounts: { repaid: 'loan', paying: 'card', interest: 'finance', fees: 'finance' },
	rows: [
		{
			n: 1,
			due: '2026-11-20',
			date: '2026-11-20',
			principal: 200_000,
			interest: 0,
			additionals: []
		}
	],
	createdAt: now,
	updatedAt: now
};
const input: ForecastInput = {
	chart: buildChart(accounts, [buffet]),
	scheduled: [music],
	installments: [cardRows],
	forecasts: [],
	settings: null,
	today: '2026-11-10'
};

describe('A one-off Outflow or Inflow', () => {
	it('is a Scheduled Transaction that happens once, paid from a Funding Account', () => {
		const draft = oneOffDraft({
			kind: 'outflow',
			description: 'Birthday gift',
			date: '2026-11-22',
			amount: '1,500',
			accountId: 'everyday',
			otherId: 'food',
			section: 'important'
		});
		const [w] = planCreatePlan(input.chart, draft, { id: 'gift', now });
		expect(w).toMatchObject({
			op: 'setScheduled',
			data: {
				section: 'important',
				versions: [
					{
						description: 'Birthday gift',
						rule: { type: 'once', date: '2026-11-22' },
						lines: [
							{ accountId: 'everyday', side: 'from', amount: 150_000 },
							{ accountId: 'food', side: 'to', amount: 150_000 }
						]
					}
				]
			}
		});
	});

	it('lands an Inflow in the Account, from where the money comes', () => {
		const draft = oneOffDraft({
			kind: 'inflow',
			description: 'Repayment',
			date: '2026-11-14',
			amount: '500',
			accountId: 'everyday',
			otherId: 'friend',
			section: null
		});
		expect(draft.from).toEqual([{ accountId: 'friend', amount: '500' }]);
		expect(draft.to).toEqual([{ accountId: 'everyday', amount: '500' }]);
		expect(draft.section).toBeNull();
	});
});

const charge = (c: Partial<Charge>): Charge =>
	({ key: 'k', label: 'x', date: '2026-11-09', amount: 1, from: 'transaction', ...c }) as Charge;

describe('Bill with next payment', () => {
	it('bills a recorded charge from the day after this payment, keeping its date', () => {
		const [w] = planBillLater(
			input,
			charge({ from: 'transaction', txId: 'buffet' }),
			'2026-11-25',
			now
		);
		expect(w).toMatchObject({
			op: 'setTransaction',
			id: 'buffet',
			data: { date: '2026-11-09', billOn: '2026-11-26' }
		});
	});

	it('moves a Scheduled charge to the day after this payment', () => {
		const [w] = planBillLater(
			input,
			charge({
				from: 'scheduled',
				link: { plan: 'scheduled', planId: 'music', due: '2026-11-12' }
			}),
			'2026-11-25',
			now
		);
		expect(w).toMatchObject({
			op: 'setScheduled',
			data: { occurrences: { '2026-11-12': { movedTo: '2026-11-26' } } }
		});
	});

	it('moves an Installment Row, keeping a flat plan flat', () => {
		const [w] = planBillLater(
			input,
			charge({
				from: 'installment',
				link: { plan: 'installment', planId: 'laptop', due: '2026-11-20' }
			}),
			'2026-11-25',
			now
		);
		if (w.op !== 'setInstallment') throw new Error('expected a plan');
		expect(w.data.rows[0]).toMatchObject({ due: '2026-11-20', date: '2026-11-26' });
		expect(w.data.entry).toBe('flat');
	});
});

// Card payments every Cut-off: 31 Oct, 15 Nov, 30 Nov, ...
const cardPay: Scheduled = {
	id: 'cardpay',
	versions: [
		{
			from: '2026-10-15',
			description: 'Pay card',
			note: '',
			tags: [],
			lines: [
				{ accountId: 'everyday', side: 'from', amount: 100_000 },
				{ accountId: 'card', side: 'to', amount: 100_000 }
			],
			rule: { type: 'cutoff', start: '2026-10-15' }
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now
};
const groceries = tx('groceries', '2026-10-20', [
	['food', 50_000],
	['card', -50_000]
]);
const paying: ForecastInput = {
	...input,
	chart: buildChart(accounts, [buffet, groceries]),
	scheduled: [music, cardPay]
};

describe('Later payments of a Liability', () => {
	it('lists the payment dates after a payment, in order', () => {
		expect(laterPayments(paying, 'card', '2026-10-31').slice(0, 3)).toEqual([
			'2026-11-15',
			'2026-11-30',
			'2026-12-15'
		]);
	});
});

describe('Moving charges to a chosen payment', () => {
	it('bills every charge from the day after the payment before the chosen one', () => {
		const writes = planBillWithPayment(
			paying,
			[
				charge({ key: 'a', from: 'transaction', txId: 'buffet' }),
				charge({ key: 'b', from: 'transaction', txId: 'groceries' })
			],
			'card',
			'2026-11-30',
			now
		);
		expect(writes).toHaveLength(2);
		expect(writes[0]).toMatchObject({
			id: 'buffet',
			data: { date: '2026-11-09', billOn: '2026-11-16' }
		});
		expect(writes[1]).toMatchObject({
			id: 'groceries',
			data: { date: '2026-10-20', billOn: '2026-11-16' }
		});
	});

	it('moves several Occurrences of one plan in a single write', () => {
		const writes = planBillWithPayment(
			paying,
			[
				charge({
					from: 'scheduled',
					link: { plan: 'scheduled', planId: 'music', due: '2026-10-12' }
				}),
				charge({
					from: 'scheduled',
					link: { plan: 'scheduled', planId: 'music', due: '2026-11-12' }
				})
			],
			'card',
			'2026-12-15',
			now
		);
		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatchObject({
			op: 'setScheduled',
			id: 'music',
			data: {
				occurrences: {
					'2026-10-12': { movedTo: '2026-12-01' },
					'2026-11-12': { movedTo: '2026-12-01' }
				}
			}
		});
	});

	it('moves an Installment Row to the chosen payment', () => {
		const [w] = planBillWithPayment(
			paying,
			[
				charge({
					from: 'installment',
					link: { plan: 'installment', planId: 'laptop', due: '2026-11-20' }
				})
			],
			'card',
			'2026-12-15',
			now
		);
		if (w.op !== 'setInstallment') throw new Error('expected a plan');
		expect(w.data.rows[0]).toMatchObject({ due: '2026-11-20', date: '2026-12-01' });
	});

	it('refuses a date that is not a payment of this Liability', () => {
		expect(() =>
			planBillWithPayment(
				paying,
				[charge({ from: 'transaction', txId: 'buffet' })],
				'card',
				'2026-11-20',
				now
			)
		).toThrow('not a payment');
	});
});
