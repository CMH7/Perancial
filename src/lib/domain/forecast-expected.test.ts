import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { buildForecast, expectedAtEnd, shortAtEnd } from './forecast.ts';
import type { Forecast, PlanLine, RepeatRule, Scheduled, Transaction } from './schemas.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

// Made-up figures in centavos.
const accounts = [
	...roots,
	account('bank', 'asset', 'asset'),
	account('salary', 'income', 'income'),
	account('rent', 'expense', 'expense'),
	account('food', 'expense', 'expense')
];
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
// Pay 20,000 each Cut-off; rent 6,000 on the 10th and the 20th.
const pay = plan('pay', { type: 'cutoff', start: '2026-11-15' }, [
	{ accountId: 'salary', side: 'from', amount: 2_000_000 },
	{ accountId: 'bank', side: 'to', amount: 2_000_000 }
]);
const rent = plan('rent', { type: 'monthly', day: 10, start: '2026-11-10' }, [
	{ accountId: 'bank', side: 'from', amount: 600_000 },
	{ accountId: 'rent', side: 'to', amount: 600_000 }
]);
const rent20 = plan('rent20', { type: 'monthly', day: 20, start: '2026-11-20' }, [
	{ accountId: 'bank', side: 'from', amount: 600_000 },
	{ accountId: 'rent', side: 'to', amount: 600_000 }
]);
const forecasts: Forecast[] = [
	{ id: '2026-11-15', fundingAccounts: ['bank'], updatedAt: now } as Forecast
];
// Rent for 10 Nov is paid; the 15 Nov pay hasn't come in. Some unplanned food spending too.
const rentPaid: Transaction = {
	...tx('rent-nov', '2026-11-10', [
		['rent', 600_000],
		['bank', -600_000]
	]),
	pays: { plan: 'scheduled', planId: 'rent', due: '2026-11-10' }
};
const snack = tx('snack', '2026-11-11', [
	['food', 50_000],
	['bank', -50_000]
]);
const input = {
	chart: buildChart(accounts, [opening('bank', 1_000_000), rentPaid, snack]),
	scheduled: [pay, rent, rent20],
	installments: [],
	forecasts,
	settings: null,
	today: '2026-11-11'
};

describe('Expected at end of a Cut-off', () => {
	it("adds only what is still to come this Cut-off to today's Balance", () => {
		// Balance today 10,000 - 6,000 - 500 = 3,500; still to receive 20,000; nothing left to pay.
		expect(expectedAtEnd(input, '2026-11-15').get('bank')).toBe(2_350_000);
	});

	it('chains what is still to come in the Cut-offs before a later one', () => {
		// 23,500 after 15 Nov, then +20,000 pay - 6,000 rent on the 20th by 30 Nov.
		expect(expectedAtEnd(input, '2026-11-30').get('bank')).toBe(3_750_000);
	});

	it('shows nothing for a Cut-off already over', () => {
		expect(expectedAtEnd(input, '2026-10-31').size).toBe(0);
	});
});

describe('Short', () => {
	it('adds up the Funding Accounts expected to end below zero', () => {
		const lean = { ...input, chart: buildChart(accounts, [opening('bank', 100_000)]) };
		// 1,000 today + 20,000 pay - 6,000 rent (10 Nov, unpaid) = 15,000 by 15 Nov; fine.
		const view = buildForecast(lean, '2026-11-15');
		expect(shortAtEnd(view, expectedAtEnd(lean, '2026-11-15'))).toBe(0);
		// Without the pay it ends at 1,000 - 6,000 = -5,000.
		const noPay = { ...lean, scheduled: [rent, rent20] };
		expect(shortAtEnd(buildForecast(noPay, '2026-11-15'), expectedAtEnd(noPay, '2026-11-15'))).toBe(
			-500_000
		);
	});

	it('falls back to Planned left for a Cut-off already over', () => {
		const view = buildForecast(input, '2026-10-31');
		expect(shortAtEnd(view, new Map())).toBe(view.totals.short);
	});
});
