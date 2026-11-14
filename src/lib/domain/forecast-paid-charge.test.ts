// A Scheduled charge on a Liability that has already been recorded: the card payment it is billed
// with must expect what the recorded Transaction charged, even when the plan's amount varies, and
// follow the Transaction's `billOn`.
import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { buildForecast, chargesFor } from './forecast.ts';
import type { Forecast, PlanLine, RepeatRule, Scheduled, Transaction } from './schemas.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

// Made-up figures in centavos.
const accounts = [
	...roots,
	account('payroll', 'asset', 'asset'),
	account('card', 'liability', 'liability', { name: 'Card X' }),
	account('software', 'expense', 'expense')
];
const line = (accountId: string, side: 'from' | 'to', amount: number | null): PlanLine => ({
	accountId,
	side,
	amount
});
const plan = (id: string, rule: RepeatRule, lines: PlanLine[]): Scheduled => ({
	id,
	versions: [
		{
			from: rule.type === 'once' ? rule.date : rule.start,
			description: id,
			note: '',
			tags: [],
			lines,
			rule
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now
});
// Pay the card on the 30th from payroll; the amount varies (whatever was charged).
const cardPay = plan('cardpay', { type: 'monthly', day: 30, start: '2026-11-30' }, [
	line('payroll', 'from', null),
	line('card', 'to', null)
]);
// A subscription charged to the card on the 2nd; its amount varies too.
const sub = plan('sub', { type: 'monthly', day: 2, start: '2026-11-02' }, [
	line('card', 'from', null),
	line('software', 'to', null)
]);
// The 2 Nov charge was recorded for 3,000.00, billed with the 30 Nov payment.
const subPaid = (billOn?: string): Transaction => ({
	...tx('sub-nov', '2026-11-02', [
		['software', 300_000],
		['card', -300_000]
	]),
	pays: { plan: 'scheduled', planId: 'sub', due: '2026-11-02' },
	...(billOn ? { billOn } : {})
});
const forecasts: Forecast[] = [
	{ id: '2026-11-30', fundingAccounts: ['payroll'], updatedAt: now } as Forecast
];
const inputWith = (paid: Transaction) => ({
	chart: buildChart(accounts, [opening('payroll', 1_000_000), paid]),
	scheduled: [cardPay, sub],
	installments: [],
	forecasts,
	settings: null,
	today: '2026-11-14'
});

describe('A recorded Scheduled charge', () => {
	it('counts its recorded amount in the card payment it is billed with', () => {
		const view = buildForecast(inputWith(subPaid('2026-11-30')), '2026-11-30');
		const payment = view.outflows.find((o) => o.key === 'scheduled:cardpay:2026-11-30');
		expect(payment?.total).toBe(300_000);
		expect(payment?.sources).toEqual([
			expect.objectContaining({ accountId: 'payroll', amount: 300_000 })
		]);
		expect(payment?.charges?.map((c) => c.amount)).toEqual([300_000]);
	});

	it('moves to the payment its Transaction is billed with', () => {
		const input = inputWith(subPaid('2026-12-30'));
		expect(chargesFor(input, 'card', '2026-11-30')).toEqual([]);
		expect(chargesFor(input, 'card', '2026-12-30').map((c) => [c.label, c.amount])).toEqual([
			['sub-nov', 300_000], // the recorded 2 Nov charge
			['sub', 0] // the 2 Dec charge, not recorded yet
		]);
	});
});
