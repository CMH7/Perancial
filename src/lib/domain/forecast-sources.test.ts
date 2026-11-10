import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import type { ForecastInput, ForecastOutflow, ResolvedSource } from './forecast.ts';
import { moveSource, planSetSources, sourceEditErrors, splitSource } from './forecast-sources.ts';
import type { Installment, Scheduled } from './schemas.ts';
import { account, now, roots } from './test-fixtures.ts';

const src = (accountId: string, amount: number, paid = 0, valid = true): ResolvedSource => ({
	accountId,
	amount,
	paid,
	valid
});

describe('Moving a source to another lane', () => {
	it('moves the whole unpaid source, merging with one already there', () => {
		expect(moveSource([src('a', 100), src('b', 50)], 'a', 'c')).toEqual([
			{ accountId: 'c', amount: 100 },
			{ accountId: 'b', amount: 50 }
		]);
		expect(moveSource([src('a', 100), src('b', 50)], 'a', 'b')).toEqual([
			{ accountId: 'b', amount: 150 }
		]);
	});

	it('leaves a source that has payments where it is', () => {
		expect(() => moveSource([src('a', 100, 40)], 'a', 'c')).toThrow(/paid/);
	});
});

describe('Splitting a source with Copy and paste', () => {
	it('moves the typed amount out of the copied source, keeping the total', () => {
		expect(splitSource([src('a', 100), src('b', 50)], 'a', 'c', 30)).toEqual([
			{ accountId: 'a', amount: 70 },
			{ accountId: 'b', amount: 50 },
			{ accountId: 'c', amount: 30 }
		]);
		expect(splitSource([src('a', 100), src('b', 50)], 'a', 'b', 100)).toEqual([
			{ accountId: 'b', amount: 150 }
		]);
	});

	it('takes no more than what is unpaid on the copied source', () => {
		expect(splitSource([src('a', 100, 80)], 'a', 'c', 50)).toEqual([
			{ accountId: 'a', amount: 80 },
			{ accountId: 'c', amount: 20 }
		]);
	});

	it('adds a new source when pasting an Unfunded Outflow', () => {
		expect(splitSource([src('a', 100)], null, 'c', 25)).toEqual([
			{ accountId: 'a', amount: 100 },
			{ accountId: 'c', amount: 25 }
		]);
	});
});

const accounts = [
	...roots,
	account('everyday', 'asset', 'asset'),
	account('savings', 'asset', 'asset'),
	account('ewallet', 'asset', 'asset'),
	account('card', 'liability', 'liability'),
	account('net', 'expense', 'expense'),
	account('loan', 'liability', 'liability'),
	account('finance', 'expense', 'expense')
];
const internet: Scheduled = {
	id: 'net',
	versions: [
		{
			from: '2026-11-20',
			description: 'Internet',
			note: '',
			tags: [],
			lines: [
				{ accountId: 'everyday', side: 'from', amount: 150_000 },
				{ accountId: 'net', side: 'to', amount: 150_000 }
			],
			rule: { type: 'monthly', day: 20, start: '2026-11-20' }
		}
	],
	end: { type: 'never' },
	occurrences: { '2026-11-20': { skipped: false } },
	createdAt: now,
	updatedAt: now
};
const loan: Installment = {
	id: 'gadget',
	kind: 'lender',
	title: 'Gadget loan',
	note: '',
	tags: [],
	purchaseDate: '2026-10-01',
	entry: 'flat',
	rule: { type: 'monthly', day: 28, start: '2026-11-28' },
	trackedFrom: 1,
	accounts: { repaid: 'loan', paying: 'everyday', interest: 'finance', fees: 'finance' },
	rows: [
		{
			n: 1,
			due: '2026-11-28',
			date: '2026-11-28',
			principal: 130_000,
			interest: 0,
			additionals: []
		}
	],
	createdAt: now,
	updatedAt: now
};
const input: ForecastInput = {
	chart: buildChart(accounts, []),
	scheduled: [internet],
	installments: [loan],
	forecasts: [
		{ id: '2026-11-15', fundingAccounts: ['everyday', 'savings'], createdAt: now, updatedAt: now }
	],
	settings: null,
	today: '2026-11-10'
};
const outflowOf = (link: ForecastOutflow['link'], sources: ResolvedSource[] = []) =>
	({ link, sources }) as unknown as ForecastOutflow;

describe('Saving Paying sources', () => {
	it('stores them on the Occurrence, keeping its other changes', () => {
		const o = outflowOf({ plan: 'scheduled', planId: 'net', due: '2026-11-20' });
		const sources = [
			{ accountId: 'everyday', amount: 100_000 },
			{ accountId: 'savings', amount: 50_000 }
		];
		const [w] = planSetSources(input, '2026-11-15', o, sources, now);
		expect(w).toMatchObject({
			op: 'setScheduled',
			id: 'net',
			data: { occurrences: { '2026-11-20': { skipped: false, sources } } }
		});
	});

	it('stores them on the Installment Row, adding back what a carried source paid before', () => {
		const o = outflowOf({ plan: 'installment', planId: 'gadget', due: '2026-11-28' }, [
			{ ...src('everyday', 50_000), priorPaid: 80_000 }
		]);
		const [w] = planSetSources(
			input,
			'2026-11-15',
			o,
			[{ accountId: 'everyday', amount: 50_000 }],
			now
		);
		if (w.op !== 'setInstallment') throw new Error('expected a plan');
		expect(w.data.rows[0].sources).toEqual([{ accountId: 'everyday', amount: 130_000 }]);
	});

	it("accepts only this Cut-off's Funding Accounts, each once, with an amount", () => {
		expect(
			sourceEditErrors(input, '2026-11-15', [
				{ accountId: 'ewallet', amount: 10 },
				{ accountId: 'savings', amount: 0 },
				{ accountId: 'savings', amount: 5 }
			])
		).toEqual([
			{ at: 'sources.0.account', message: "Not one of this Cut-off's Funding Accounts" },
			{ at: 'sources.1.amount', message: 'Enter an amount above zero' },
			{ at: 'sources.2.account', message: 'This Account is already a source' }
		]);
		const o = outflowOf({ plan: 'scheduled', planId: 'net', due: '2026-11-20' });
		expect(() =>
			planSetSources(input, '2026-11-15', o, [{ accountId: 'ewallet', amount: 10 }], now)
		).toThrow(/Funding Accounts/);
	});
});
