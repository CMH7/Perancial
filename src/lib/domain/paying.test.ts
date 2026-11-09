import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { linkCandidates, planLink, planUnlink, recordDraft } from './paying.ts';
import type { PlanVersion, Scheduled, Transaction } from './schemas.ts';
import { occurrencesOf, occurrenceStatus } from './scheduled.ts';
import type { OccurrenceView } from './scheduled-views.ts';
import { planDeleteTransaction, planSaveTransaction } from './transactions.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const lines: PlanVersion['lines'] = [
	{ accountId: 'bpi', side: 'from', amount: null },
	{ accountId: 'rent', side: 'to', amount: 1200000 },
	{ accountId: 'bank-fees', side: 'to', amount: 1500, fee: 'additional' }
];
const rent: Scheduled = {
	id: 'rent',
	versions: [
		{
			from: '2026-10-05',
			description: 'Rent',
			note: 'Landlord: Aling Nena',
			tags: ['house'],
			lines,
			rule: { type: 'monthly', day: 5, start: '2026-10-05' }
		}
	],
	end: { type: 'never' },
	occurrences: { '2026-12-05': { amounts: [null, 1300000, 1500] } },
	createdAt: now,
	updatedAt: now
};
const accounts = [
	...roots,
	account('bpi', 'asset', 'asset'),
	account('gcash', 'asset', 'asset'),
	account('rent', 'expense', 'expense'),
	account('food', 'expense', 'expense'),
	account('bank-fees', 'expense', 'expense')
];
const t = (
	id: string,
	date: string,
	entries: [string, number][],
	extra: Partial<Transaction> = {}
) => ({
	...tx(id, date, entries),
	...extra
});
const today = '2026-11-10';
const view = (chart: ReturnType<typeof buildChart>, due: string): OccurrenceView => {
	const occurrence = occurrencesOf(rent, { from: due, to: due })[0];
	return { plan: rent, occurrence, status: occurrenceStatus(chart, occurrence, { today }) };
};

describe('recordDraft', () => {
	it('fills the form from the occurrence, its own amounts included, dated today', () => {
		const chart = buildChart(accounts, []);
		expect(recordDraft(view(chart, '2026-12-05'), { today })).toEqual({
			date: today,
			description: 'Rent',
			note: 'Landlord: Aling Nena',
			status: 'cleared',
			tags: ['house'],
			from: [{ accountId: 'bpi', amount: '' }],
			to: [{ accountId: 'rent', amount: '13000.00' }],
			fees: [{ accountId: 'bank-fees', amount: '15.00', mode: 'additional' }]
		});
	});

	it('asks only for what is left when partly paid, without the fees', () => {
		const chart = buildChart(accounts, [
			t(
				'part',
				'2026-11-05',
				[
					['bpi', -500000],
					['rent', 500000]
				],
				{ pays: { plan: 'scheduled', planId: 'rent', due: '2026-11-05' } }
			)
		]);
		const draft = recordDraft(view(chart, '2026-11-05'), { today });
		expect(draft.from).toEqual([{ accountId: 'bpi', amount: '' }]);
		expect(draft.to).toEqual([{ accountId: 'rent', amount: '7015.00' }]);
		expect(draft.fees).toEqual([]);
	});
});

describe('saving a recorded occurrence', () => {
	it('stores the paid link on a new Transaction', () => {
		const chart = buildChart(accounts, []);
		const link = { plan: 'scheduled' as const, planId: 'rent', due: '2026-12-05' };
		const [w] = planSaveTransaction(chart, recordDraft(view(chart, '2026-12-05'), { today }), {
			id: 'new',
			now,
			today,
			pays: link
		});
		expect(w).toMatchObject({ op: 'setTransaction', data: { pays: link } });
	});
});

describe('linkCandidates', () => {
	it('offers unlinked Transactions on the plan’s Accounts within a week, nearest first', () => {
		const chart = buildChart(accounts, [
			t('near', '2026-11-06', [
				['bpi', -1200000],
				['rent', 1200000]
			]),
			t('far', '2026-11-20', [
				['bpi', -1200000],
				['rent', 1200000]
			]),
			t('closer', '2026-11-05', [
				['gcash', -1000],
				['bank-fees', 1000]
			]),
			t('other-accounts', '2026-11-05', [
				['gcash', -20000],
				['food', 20000]
			]),
			t(
				'linked',
				'2026-11-05',
				[
					['bpi', -1200000],
					['rent', 1200000]
				],
				{ pays: { plan: 'scheduled', planId: 'water', due: '2026-11-05' } }
			)
		]);
		expect(linkCandidates(chart, view(chart, '2026-11-05')).map((x) => x.id)).toEqual([
			'closer',
			'near'
		]);
	});
});

describe('planLink and planUnlink', () => {
	const later = new Date('2026-11-10T08:00:00Z');
	const link = { plan: 'scheduled' as const, planId: 'rent', due: '2026-11-05' };
	const chart = buildChart(accounts, [
		t('free', '2026-11-06', [
			['bpi', -1200000],
			['rent', 1200000]
		]),
		t(
			'taken',
			'2026-11-06',
			[
				['bpi', -1200000],
				['rent', 1200000]
			],
			{ pays: { plan: 'scheduled', planId: 'water', due: '2026-11-05' } }
		)
	]);

	it('sets or clears only the paid link', () => {
		const { id: _id, ...free } = chart.transaction('free')!;
		expect(planLink(chart, 'free', link, { now: later })).toEqual([
			{ op: 'setTransaction', id: 'free', data: { ...free, pays: link, updatedAt: later } }
		]);
		expect(planUnlink(chart, 'taken', { now: later })).toMatchObject([
			{ id: 'taken', data: { pays: null, updatedAt: later } }
		]);
	});

	it('refuses a Transaction that already pays another occurrence', () => {
		expect(() => planLink(chart, 'taken', link, { now: later })).toThrow(/already pays/);
	});
});

describe('clearing Mark paid with the last payment', () => {
	const later = new Date('2026-11-10T08:00:00Z');
	const due = '2026-11-05';
	const settled: Scheduled = {
		...rent,
		occurrences: { [due]: { settled: true }, '2026-12-05': rent.occurrences['2026-12-05'] }
	};
	const payment = (id: string) =>
		t(
			id,
			due,
			[
				['bpi', -500000],
				['rent', 500000]
			],
			{ pays: { plan: 'scheduled', planId: 'rent', due } }
		);
	const planWrite = (writes: ReturnType<typeof planUnlink>) =>
		writes.find((w) => w.op === 'setScheduled');

	it('clears it when the last paying Transaction is unlinked or deleted', () => {
		const chart = buildChart(accounts, [payment('only')]);
		for (const writes of [
			planUnlink(chart, 'only', { now: later, plans: [settled] }),
			planDeleteTransaction(chart, 'only', { now: later, plans: [settled] })
		]) {
			expect(planWrite(writes)).toMatchObject({
				id: 'rent',
				data: { occurrences: { '2026-12-05': rent.occurrences['2026-12-05'] }, updatedAt: later }
			});
			expect(
				planWrite(writes)!.op === 'setScheduled' && planWrite(writes)!.data.occurrences[due]
			).toBeFalsy();
		}
	});

	it('keeps it while another payment remains, or when nothing was marked', () => {
		const two = buildChart(accounts, [payment('a'), payment('b')]);
		expect(planWrite(planUnlink(two, 'a', { now: later, plans: [settled] }))).toBeUndefined();
		const one = buildChart(accounts, [payment('only')]);
		expect(planWrite(planUnlink(one, 'only', { now: later, plans: [rent] }))).toBeUndefined();
	});
});
