import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { oneOffDraft, planBillLater } from './forecast-add.ts';
import type { Charge, ForecastInput } from './forecast.ts';
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
