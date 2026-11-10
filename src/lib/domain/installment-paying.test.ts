import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	installmentLinkCandidates,
	installmentRecordDraft,
	paidLinkLabel
} from './installment-paying.ts';
import type { Installment, Scheduled, Transaction } from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const peso = (p: number) => Math.round(p * 100);
const today = '2026-11-10';
const accounts = [
	...roots,
	account('bpi', 'asset', 'asset'),
	account('loan-money', 'asset', 'asset'),
	account('claude-loan', 'liability', 'liability'),
	account('interest', 'expense', 'expense'),
	account('fees', 'expense', 'expense'),
	account('food', 'expense', 'expense')
];
const claude: Installment = {
	id: 'claude',
	kind: 'lender',
	title: 'Claude',
	note: '',
	tags: ['claude'],
	purchaseDate: '2026-01-12',
	entry: 'varied',
	rule: { type: 'monthly', day: 9, start: '2026-02-09' },
	trackedFrom: 0,
	accounts: { repaid: 'claude-loan', paying: 'bpi', interest: 'interest', fees: 'fees' },
	rows: [
		{
			n: 9,
			due: '2026-11-09',
			date: '2026-11-09',
			principal: peso(1028.58),
			interest: peso(59.75),
			additionals: []
		},
		{
			n: 10,
			due: '2026-12-09',
			date: '2026-12-09',
			principal: peso(1043.2),
			interest: 0,
			additionals: [
				{ description: 'Late fee', amount: peso(100) },
				{ description: 'Stamp', amount: peso(20) }
			]
		}
	],
	createdAt: now,
	updatedAt: now
};
const paying = (id: string, date: string, amount: number, pays: Transaction['pays'] = null) => ({
	...tx(id, date, [
		['bpi', -amount],
		['claude-loan', amount]
	]),
	pays
});

describe('installmentRecordDraft', () => {
	it('splits a lender row: principal to the Liability, interest and additionals to Expenses', () => {
		const chart = buildChart(accounts, []);
		expect(installmentRecordDraft(chart, claude, '2026-11-09', { today })).toEqual({
			date: today,
			description: 'Claude #9',
			note: '',
			status: 'cleared',
			tags: ['claude'],
			from: [{ accountId: 'bpi', amount: '' }],
			to: [
				{ accountId: 'claude-loan', amount: '1028.58' },
				{ accountId: 'interest', amount: '59.75' }
			],
			fees: []
		});
		expect(installmentRecordDraft(chart, claude, '2026-12-09', { today })).toMatchObject({
			description: 'Claude #10',
			note: 'Late fee, Stamp',
			to: [
				{ accountId: 'claude-loan', amount: '1043.20' },
				{ accountId: 'fees', amount: '120.00' }
			]
		});
	});

	it('merges lines on the same Account', () => {
		const shared = { ...claude, accounts: { ...claude.accounts, fees: 'interest' } };
		const rows = [{ ...claude.rows[1], interest: peso(5) }];
		expect(
			installmentRecordDraft(buildChart(accounts, []), { ...shared, rows }, '2026-12-09', { today })
				.to
		).toEqual([
			{ accountId: 'claude-loan', amount: '1043.20' },
			{ accountId: 'interest', amount: '125.00' }
		]);
	});

	it('fills only what is left on a Partly Paid row: interest first, then additionals, then principal', () => {
		const chart = buildChart(accounts, [
			paying('a', '2026-11-01', peso(100), {
				plan: 'installment',
				planId: 'claude',
				due: '2026-11-09'
			}),
			paying('b', '2026-11-01', peso(110), {
				plan: 'installment',
				planId: 'claude',
				due: '2026-12-09'
			})
		]);
		expect(installmentRecordDraft(chart, claude, '2026-11-09', { today }).to).toEqual([
			{ accountId: 'claude-loan', amount: '988.33' }
		]);
		expect(installmentRecordDraft(chart, claude, '2026-12-09', { today }).to).toEqual([
			{ accountId: 'claude-loan', amount: '1043.20' },
			{ accountId: 'fees', amount: '10.00' }
		]);
	});

	it('sends everything into the repaid Asset for an internal plan', () => {
		const internal: Installment = {
			...claude,
			kind: 'internal',
			accounts: { repaid: 'loan-money', paying: 'bpi', interest: null, fees: null }
		};
		expect(
			installmentRecordDraft(buildChart(accounts, []), internal, '2026-12-09', { today }).to
		).toEqual([{ accountId: 'loan-money', amount: '1163.20' }]);
	});
});

describe('installmentLinkCandidates', () => {
	it('lists unlinked Transactions on the repaid Account within 31 days, nearest first', () => {
		const chart = buildChart(accounts, [
			paying('far', '2026-10-01', peso(1)),
			paying('near', '2026-11-12', peso(1)),
			paying('edge', '2026-10-09', peso(1)),
			paying('linked', '2026-11-09', peso(1), {
				plan: 'installment',
				planId: 'x',
				due: '2026-11-09'
			}),
			tx('other', '2026-11-09', [
				['bpi', -100],
				['food', 100]
			])
		]);
		expect(installmentLinkCandidates(chart, claude, '2026-11-09').map((t) => t.id)).toEqual([
			'near',
			'edge'
		]);
	});
});

describe('paidLinkLabel', () => {
	const rent = {
		id: 'rent',
		versions: [{ from: '2026-01-05', description: 'Rent' }]
	} as unknown as Scheduled;
	const plans = { scheduled: [rent], installments: [claude] };

	it('names the occurrence or row it pays and the page it links to', () => {
		expect(paidLinkLabel({ plan: 'scheduled', planId: 'rent', due: '2026-12-05' }, plans)).toEqual({
			text: 'Rent, 5 Dec 2026',
			kind: 'scheduled'
		});
		expect(
			paidLinkLabel({ plan: 'installment', planId: 'claude', due: '2026-11-09' }, plans)
		).toEqual({ text: 'Claude #9, 9 Nov 2026', kind: 'installment' });
	});

	it('says so when the plan or row is gone', () => {
		expect(
			paidLinkLabel({ plan: 'installment', planId: 'gone', due: '2026-11-09' }, plans)
		).toEqual({ text: 'a deleted plan, 9 Nov 2026', kind: null });
	});
});
