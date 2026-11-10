import { describe, expect, it } from 'vitest';
import { forecastRecordDraft, formatPicks, parsePicks, recordPicks } from './forecast-record.ts';
import type { ForecastOutflow } from './forecast.ts';
import type { TransactionDraft } from './transactions.ts';

const outflow = {
	sources: [
		{ accountId: 'everyday', amount: 100_000, paid: 100_000, valid: true },
		{ accountId: 'savings', amount: 50_000, paid: 10_000, valid: true },
		{ accountId: 'ewallet', amount: 24_800, paid: 0, valid: false },
		{ accountId: 'payroll', amount: 30_000, paid: 0, valid: true }
	]
} as ForecastOutflow;

const base: TransactionDraft = {
	date: '2026-11-20',
	description: 'Card X payment',
	note: '',
	status: 'cleared',
	tags: [],
	from: [{ accountId: 'everyday', amount: '' }],
	to: [{ accountId: 'card', amount: '' }],
	fees: [{ accountId: 'fees', amount: '5.00', mode: 'additional' }]
};

describe('Recording from a Forecast', () => {
	it('records what is left on every valid source, or on one', () => {
		expect(recordPicks(outflow, 'all')).toEqual([
			{ accountId: 'savings', amount: 40_000 },
			{ accountId: 'payroll', amount: 30_000 }
		]);
		expect(recordPicks(outflow, 'payroll')).toEqual([{ accountId: 'payroll', amount: 30_000 }]);
		expect(recordPicks(outflow, 'everyday')).toEqual([]);
		expect(recordPicks(outflow, 'ewallet')).toEqual([]);
	});

	it('round-trips the picks through the Record link', () => {
		const picks = [
			{ accountId: 'savings', amount: 40_000 },
			{ accountId: 'payroll', amount: 30_000 }
		];
		expect(formatPicks(picks)).toBe('savings:40000,payroll:30000');
		expect(parsePicks('savings:40000,payroll:30000')).toEqual(picks);
		expect(parsePicks('savings:x,:5,payroll:-1')).toEqual([]);
	});

	it('pays From the picked Accounts, keeping To and Fees when it covers the whole draft', () => {
		const whole = {
			...base,
			from: [{ accountId: 'everyday', amount: '700.05' }],
			to: [{ accountId: 'card', amount: '700.00' }]
		};
		expect(
			forecastRecordDraft(whole, [
				{ accountId: 'savings', amount: 40_000 },
				{ accountId: 'payroll', amount: 30_005 }
			])
		).toEqual({
			...whole,
			from: [
				{ accountId: 'savings', amount: '400.00' },
				{ accountId: 'payroll', amount: '300.05' }
			]
		});
	});

	it('pays only the picked part otherwise: one To line for that amount, no Fees', () => {
		expect(forecastRecordDraft(base, [{ accountId: 'payroll', amount: 30_000 }])).toEqual({
			...base,
			from: [{ accountId: 'payroll', amount: '300.00' }],
			to: [{ accountId: 'card', amount: '300.00' }],
			fees: []
		});
	});
});
