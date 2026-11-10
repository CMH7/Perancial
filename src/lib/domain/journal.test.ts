import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	journal,
	journalRow,
	noFilters,
	planClear,
	planQuickChange,
	planSetStatus,
	selectionAfterFilter
} from './journal.ts';
import type { Transaction } from './schemas.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

const at = (iso: string) => new Date(iso);
const t = (
	id: string,
	date: string,
	entries: [string, number][],
	extra: Partial<Transaction> = {}
): Transaction => ({ ...tx(id, date, entries), ...extra });

const transactions = [
	opening('bpi', 4200000),
	t(
		'rent',
		'2026-10-15',
		[
			['bpi', -1200000],
			['rent', 1200000]
		],
		{ description: 'Rent October', tags: ['house'], createdAt: at('2026-10-15T08:00:00Z') }
	),
	t(
		'send',
		'2026-10-15',
		[
			['bpi', -501500],
			['gcash', 500000],
			['bank-fees', 1500]
		],
		{ description: 'Send to GCash', createdAt: at('2026-10-15T09:00:00Z') }
	),
	t(
		'salary',
		'2026-10-30',
		[
			['salary', -2350000],
			['bpi', 2350000]
		],
		{ description: 'Salary, 2nd cut-off', note: 'Net of tax', tags: ['work'] }
	),
	t(
		'grab',
		'2026-11-05',
		[
			['gcash', -24500],
			['dining', 24500]
		],
		{ description: 'Grab ride home', status: 'pending' }
	)
];

const chart = buildChart(
	[
		...roots,
		account('banks', 'asset', 'asset', { name: 'Banks' }),
		account('bpi', 'asset', 'banks', { name: 'BPI Savings' }),
		account('gcash', 'asset', 'asset', { name: 'GCash' }),
		account('salary', 'income', 'income', { name: 'Salary' }),
		account('rent', 'expense', 'expense', { name: 'Rent' }),
		account('dining', 'expense', 'expense', { name: 'Dining out' }),
		account('bank-fees', 'expense', 'expense', { name: 'Bank fees' })
	],
	transactions
);
const ids = (filters: Partial<ReturnType<typeof noFilters>> = {}) =>
	journal(chart, { ...noFilters(), ...filters }).map((x) => x.id);

describe('journal', () => {
	it('lists every Transaction but Opening Balances, newest first, later-entered first on a date', () => {
		expect(ids()).toEqual(['grab', 'salary', 'send', 'rent']);
	});

	it('filters by date range, kind, status and tag', () => {
		expect(ids({ from: '2026-10-16', to: '2026-10-31' })).toEqual(['salary']);
		expect(ids({ kind: 'transfer' })).toEqual([]);
		expect(ids({ kind: 'expense' })).toEqual(['grab', 'send', 'rent']);
		expect(ids({ kind: 'income' })).toEqual(['salary']);
		expect(ids({ status: 'pending' })).toEqual(['grab']);
		expect(ids({ tag: 'house' })).toEqual(['rent']);
	});

	it('filters by Account, a Group Account covering every Account under it', () => {
		expect(ids({ accountId: 'gcash' })).toEqual(['grab', 'send']);
		expect(ids({ accountId: 'banks' })).toEqual(['salary', 'send', 'rent']);
	});

	it('searches Description, Note, tags and Account names, ignoring case, with the filters', () => {
		expect(ids({ q: 'gcash' })).toEqual(['grab', 'send']);
		expect(ids({ q: 'NET OF' })).toEqual(['salary']);
		expect(ids({ q: 'work' })).toEqual(['salary']);
		expect(ids({ q: 'bank fees' })).toEqual(['send']);
		expect(ids({ q: 'gcash', status: 'pending' })).toEqual(['grab']);
	});
});

describe('journalRow', () => {
	it('summarises From → To, the total, the kind and the status', () => {
		expect(journalRow(chart, chart.transaction('send')!)).toEqual({
			from: ['BPI Savings'],
			to: ['GCash', 'Bank fees'],
			total: 501500,
			kind: 'expense',
			pending: false
		});
		expect(journalRow(chart, chart.transaction('grab')!)).toMatchObject({
			total: 24500,
			pending: true
		});
	});
});

describe('planSetStatus', () => {
	const later = new Date('2026-11-10T08:00:00Z');

	it('changes only the status and the update time', () => {
		const grab = chart.transaction('grab')!;
		const { id, ...data } = grab;
		expect(planSetStatus(chart, 'grab', 'cleared', { now: later })).toEqual([
			{ op: 'setTransaction', id, data: { ...data, status: 'cleared', updatedAt: later } }
		]);
	});

	it('writes nothing when the status is already set, and refuses Opening Balances', () => {
		expect(planSetStatus(chart, 'salary', 'cleared', { now: later })).toEqual([]);
		expect(() => planSetStatus(chart, 'opening_bpi', 'pending', { now: later })).toThrow(
			/Opening Balance/
		);
	});

	it('keeps the creation time', () => {
		const [write] = planSetStatus(chart, 'grab', 'cleared', { now: later });
		expect(write).toMatchObject({ data: { createdAt: now } });
	});
});

describe('planQuickChange', () => {
	const later = new Date('2026-11-10T08:00:00Z');
	const opts = { now: later, today: '2026-11-10' };

	it('clears several Transactions in one list of writes, touching only status and update time', () => {
		const pending = buildChart(chart.all(), [
			...transactions.filter((x) => x.id !== 'rent'),
			{ ...transactions.find((x) => x.id === 'rent')!, status: 'pending' }
		]);
		const writes = planQuickChange(pending, ['grab', 'rent'], { status: 'cleared' }, opts);
		expect(writes).toHaveLength(2);
		for (const w of writes) {
			const { id, ...data } = pending.transaction(w.id)!;
			expect(w).toEqual({
				op: 'setTransaction',
				id,
				data: { ...data, status: 'cleared', updatedAt: later }
			});
		}
	});

	it('sets several cleared Transactions back to pending', () => {
		const writes = planQuickChange(chart, ['rent', 'salary', 'grab'], { status: 'pending' }, opts);
		expect(writes.map((w) => w.id)).toEqual(['rent', 'salary']);
		expect(writes).toEqual([
			expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) }),
			expect.objectContaining({ data: expect.objectContaining({ status: 'pending' }) })
		]);
	});

	it('moves the date and keeps everything else, links included', () => {
		const linked = buildChart(chart.all(), [
			...transactions.filter((x) => x.id !== 'rent'),
			{
				...transactions.find((x) => x.id === 'rent')!,
				pays: { plan: 'scheduled', planId: 'rent-plan', due: '2026-10-15' },
				billOn: '2026-11-01'
			}
		]);
		const [write] = planQuickChange(linked, ['rent'], { date: '2026-10-20' }, opts);
		const { id: _id, ...data } = linked.transaction('rent')!;
		expect(write).toEqual({
			op: 'setTransaction',
			id: 'rent',
			data: { ...data, date: '2026-10-20', updatedAt: later }
		});
	});

	it('sets status and date together', () => {
		const [write] = planQuickChange(
			chart,
			['grab'],
			{ status: 'cleared', date: '2026-11-07' },
			opts
		);
		expect(write).toMatchObject({ data: { status: 'cleared', date: '2026-11-07' } });
	});

	it('skips Transactions the change leaves as they are, and repeated ids', () => {
		expect(planQuickChange(chart, ['salary', 'grab', 'grab'], { status: 'cleared' }, opts)).toEqual(
			[expect.objectContaining({ id: 'grab' })]
		);
		expect(planQuickChange(chart, ['salary'], { date: '2026-10-30' }, opts)).toEqual([]);
	});

	it('refuses a date after today or not a date', () => {
		expect(() => planQuickChange(chart, ['grab'], { date: '2026-11-11' }, opts)).toThrow(
			/Scheduled Transaction/
		);
		expect(() => planQuickChange(chart, ['grab'], { date: '' }, opts)).toThrow(/Choose a date/);
	});

	it('refuses Opening Balances and Transactions that no longer exist', () => {
		expect(() => planQuickChange(chart, ['opening_bpi'], { status: 'cleared' }, opts)).toThrow(
			/Opening Balance/
		);
		expect(() => planQuickChange(chart, ['gone'], { status: 'cleared' }, opts)).toThrow(
			/no longer exists/
		);
	});

	it('refuses more than one batch holds', () => {
		const many = Array.from({ length: 501 }, () => 'grab');
		expect(() => planQuickChange(chart, many, { status: 'cleared' }, opts)).not.toThrow();
		const big = buildChart(
			chart.all(),
			Array.from({ length: 501 }, (_, i) =>
				t(
					`p${i}`,
					'2026-11-01',
					[
						['gcash', -100],
						['dining', 100]
					],
					{ status: 'pending' }
				)
			)
		);
		expect(() =>
			planQuickChange(
				big,
				big.transactions().map((x) => x.id),
				{ status: 'cleared' },
				opts
			)
		).toThrow(/at most 500/);
	});
});

describe('planClear', () => {
	const later = new Date('2026-11-10T08:00:00Z');

	it('clears a pending Transaction and can move it to another date in the same write', () => {
		expect(planClear(chart, 'grab', { now: later, today: '2026-11-10' })).toEqual([
			expect.objectContaining({
				data: expect.objectContaining({ status: 'cleared', date: '2026-11-05' })
			})
		]);
		expect(
			planClear(chart, 'grab', { date: '2026-11-09', now: later, today: '2026-11-10' })
		).toEqual([
			expect.objectContaining({
				data: expect.objectContaining({ status: 'cleared', date: '2026-11-09' })
			})
		]);
	});
});

describe('selectionAfterFilter', () => {
	it('keeps only selected ids still visible', () => {
		expect(selectionAfterFilter(new Set(['grab', 'rent', 'gone']), ['grab', 'salary'])).toEqual(
			new Set(['grab'])
		);
	});
});
