import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	accountChoices,
	canBillLater,
	draftFromTransaction,
	duplicateDraft,
	evaluateDraft,
	kindOf,
	planDeleteTransaction,
	planDeleteTransactions,
	planSaveTransaction,
	normalizeTag,
	normalizeTags,
	type TransactionDraft
} from './transactions.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

const chart = buildChart(
	[
		...roots,
		account('banks', 'asset', 'asset'),
		account('bpi', 'asset', 'banks'),
		account('gcash', 'asset', 'asset'),
		account('cash', 'asset', 'asset'),
		account('old-wallet', 'asset', 'asset', { archived: true }),
		account('cc-bdo', 'liability', 'liability'),
		account('salary', 'income', 'income'),
		account('food', 'expense', 'expense'),
		account('bank-fees', 'expense', 'expense'),
		account('tax', 'expense', 'expense')
	],
	[
		opening('bpi', 4200000),
		opening('gcash', 120000),
		tx('lunch', '2026-11-03', [
			['cash', -20000],
			['food', 20000]
		]),
		// The archived wallet got money and spent all of it, so its Balance is zero.
		tx('wallet-in', '2026-10-01', [
			['bpi', -100000],
			['old-wallet', 100000]
		]),
		{
			...tx('wallet-out', '2026-10-02', [
				['old-wallet', -100000],
				['cash', 100000]
			]),
			pays: { plan: 'scheduled', planId: 'p1', due: '2026-10-02' }
		}
	]
);

const e = (accountId: string, amount: number) => ({ accountId, amount });

describe('kindOf', () => {
	it('is an Expense when money reaches an Expense Account, whatever pays for it', () => {
		expect(kindOf(chart, [e('cash', -20000), e('food', 20000)])).toBe('expense');
		expect(kindOf(chart, [e('cc-bdo', -245000), e('food', 245000)])).toBe('expense');
		// A Transfer that carries a fee is an Expense.
		expect(kindOf(chart, [e('bpi', -501500), e('gcash', 500000), e('bank-fees', 1500)])).toBe(
			'expense'
		);
	});

	it('is Income when money leaves an Income Account', () => {
		expect(kindOf(chart, [e('salary', -2350000), e('bpi', 2350000)])).toBe('income');
	});

	it('is Income and Expense when both happen, and a Transfer otherwise', () => {
		expect(kindOf(chart, [e('salary', -2500000), e('bpi', 2350000), e('tax', 150000)])).toBe(
			'income-and-expense'
		);
		expect(kindOf(chart, [e('bpi', -850000), e('cc-bdo', 850000)])).toBe('transfer');
		expect(kindOf(chart, [e('bpi', -200000), e('cash', 200000)])).toBe('transfer');
	});
});

describe('normalizeTag', () => {
	it('lowercases, turns spaces into hyphens, and drops other characters', () => {
		expect(normalizeTag('Baguio 2026')).toBe('baguio-2026');
		expect(normalizeTag('  #House  Reno! ')).toBe('house-reno');
		expect(normalizeTag('---')).toBe('');
	});

	it('drops empty and repeated tags, keeping first-seen order', () => {
		expect(normalizeTags(['Trip', 'trip', '', 'Christmas', '#trip'])).toEqual([
			'trip',
			'christmas'
		]);
	});
});

const today = '2026-11-10';
const draft = (patch: Partial<TransactionDraft> = {}): TransactionDraft => ({
	date: '2026-11-09',
	description: 'Send to GCash',
	note: '',
	status: 'cleared',
	tags: [],
	from: [{ accountId: 'bpi', amount: '5,000' }],
	to: [{ accountId: 'gcash', amount: '5000.00' }],
	fees: [],
	...patch
});
const at = (d: TransactionDraft) => evaluateDraft(chart, d, { today }).errors.map((x) => x.at);

describe('evaluateDraft', () => {
	it('builds signed Entries in form order, From first, then To, then fees', () => {
		const ev = evaluateDraft(
			chart,
			draft({
				from: [{ accountId: 'bpi', amount: '' }],
				fees: [{ accountId: 'bank-fees', amount: '15', mode: 'additional' }]
			}),
			{ today }
		);
		expect(ev.errors).toEqual([]);
		expect(ev.entries).toEqual([
			{ accountId: 'bpi', amount: -501500 },
			{ accountId: 'gcash', amount: 500000 },
			{ accountId: 'bank-fees', amount: 1500, fee: 'additional' }
		]);
		expect(ev.kind).toBe('expense');
	});

	it('fills the one blank amount with the remainder, on either side', () => {
		const from = evaluateDraft(chart, draft({ from: [{ accountId: 'bpi', amount: '' }] }), {
			today
		});
		expect(from.filled).toEqual({ side: 'from', index: 0, amount: 500000 });
		// Salary less tax: the deposit is what is left.
		const less = evaluateDraft(
			chart,
			draft({
				from: [{ accountId: 'salary', amount: '25,000' }],
				to: [{ accountId: 'bpi', amount: '' }],
				fees: [{ accountId: 'tax', amount: '1,500', mode: 'less' }]
			}),
			{ today }
		);
		expect(less.filled).toEqual({ side: 'to', index: 0, amount: 2350000 });
		expect(less.fromTotal).toBe(2500000);
		expect(less.toTotal).toBe(2500000);
	});

	it('refuses more than one blank amount, or a blank with nothing left to fill', () => {
		expect(
			at(
				draft({
					from: [{ accountId: 'bpi', amount: '' }],
					to: [{ accountId: 'gcash', amount: '' }]
				})
			)
		).toEqual(['total']);
		expect(
			at(
				draft({
					from: [
						{ accountId: 'bpi', amount: '5000' },
						{ accountId: 'cash', amount: '' }
					]
				})
			)
		).toEqual(['from.1.amount']);
	});

	it('refuses amounts that are not positive whole centavos, and unequal totals', () => {
		expect(at(draft({ to: [{ accountId: 'gcash', amount: '5000.001' }] }))).toContain(
			'to.0.amount'
		);
		expect(at(draft({ to: [{ accountId: 'gcash', amount: 'abc' }] }))).toContain('to.0.amount');
		expect(at(draft({ to: [{ accountId: 'gcash', amount: '-5000' }] }))).toContain('to.0.amount');
		expect(at(draft({ to: [{ accountId: 'gcash', amount: '0' }] }))).toContain('to.0.amount');
		expect(at(draft({ to: [{ accountId: 'gcash', amount: '4999' }] }))).toEqual(['total']);
	});

	it('refuses missing, Group, system, and repeated-across-sides Accounts', () => {
		expect(at(draft({ to: [{ accountId: '', amount: '5000' }] }))).toEqual(['to.0.account']);
		expect(at(draft({ to: [{ accountId: 'banks', amount: '5000' }] }))).toEqual(['to.0.account']);
		expect(at(draft({ to: [{ accountId: 'opening-balances', amount: '5000' }] }))).toEqual([
			'to.0.account'
		]);
		expect(at(draft({ to: [{ accountId: 'bpi', amount: '5000' }] }))).toEqual(['to.0.account']);
	});

	it('refuses an Archived Account on a new line, and a fee on anything but an Expense', () => {
		expect(at(draft({ to: [{ accountId: 'old-wallet', amount: '5000' }] }))).toEqual([
			'to.0.account'
		]);
		expect(
			at(
				draft({
					fees: [{ accountId: 'cash', amount: '15', mode: 'additional' }],
					from: [{ accountId: 'bpi', amount: '' }]
				})
			)
		).toEqual(['fees.0.account']);
	});

	it('requires a date no later than today, and a Description of at most 200 characters', () => {
		expect(at(draft({ date: '2026-11-11' }))).toEqual(['date']);
		expect(at(draft({ date: '' }))).toEqual(['date']);
		expect(at(draft({ description: '   ' }))).toEqual(['description']);
		expect(at(draft({ description: 'x'.repeat(201) }))).toEqual(['description']);
		expect(at(draft({ note: 'x'.repeat(5001) }))).toEqual(['note']);
		expect(at(draft({ date: today }))).toEqual([]);
	});
});

describe('evaluateDraft: uncovered', () => {
	const uncovered = (d: TransactionDraft) => evaluateDraft(chart, d, { today }).uncovered;

	it('is what the From lines still have to cover: To plus fees, less From', () => {
		expect(
			uncovered(
				draft({
					from: [{ accountId: 'gcash', amount: '1,200' }],
					fees: [{ accountId: 'bank-fees', amount: '15', mode: 'additional' }]
				})
			)
		).toBe(381500);
	});

	it('is zero once covered, including by a blank From line that fills with the rest', () => {
		expect(uncovered(draft())).toBe(0);
		expect(
			uncovered(
				draft({
					from: [
						{ accountId: 'gcash', amount: '1,200' },
						{ accountId: 'bpi', amount: '' }
					]
				})
			)
		).toBe(0);
	});

	it('is negative when From is more than To', () => {
		expect(uncovered(draft({ from: [{ accountId: 'bpi', amount: '6,000' }] }))).toBe(-100000);
	});
});

describe('accountChoices', () => {
	it('lists the Leaf Accounts of a type by full path, with each Balance as of today', () => {
		expect(accountChoices(chart, 'asset', { today })).toEqual([
			{ id: 'bpi', label: 'banks › bpi', balance: 4100000 },
			{ id: 'cash', label: 'cash', balance: 80000 },
			{ id: 'gcash', label: 'gcash', balance: 120000 }
		]);
	});

	it('leaves out Entries dated after the as-of date', () => {
		const cash = accountChoices(chart, 'asset', { today: '2026-11-02' }).find(
			(c) => c.id === 'cash'
		);
		expect(cash?.balance).toBe(100000);
	});

	it('shows the friendly sign per Account Type, and Abnormal Balances as negative', () => {
		const owing = buildChart(
			[...roots, account('cc', 'liability', 'liability'), account('ewallet', 'asset', 'asset')],
			[
				opening('cc', -500000),
				tx('overdraw', '2026-11-01', [
					['ewallet', -2000],
					['cc', 2000]
				])
			]
		);
		expect(accountChoices(owing, 'liability', { today })).toEqual([
			{ id: 'cc', label: 'cc', balance: 498000 }
		]);
		expect(accountChoices(owing, 'asset', { today })).toEqual([
			{ id: 'ewallet', label: 'ewallet', balance: -2000 }
		]);
	});

	it('includes an Archived Account only when kept, and never system Accounts', () => {
		expect(accountChoices(chart, 'asset', { today }).map((c) => c.id)).not.toContain('old-wallet');
		expect(
			accountChoices(chart, 'asset', { today, kept: new Set(['old-wallet']) }).find(
				(c) => c.id === 'old-wallet'
			)
		).toEqual({ id: 'old-wallet', label: 'old-wallet (archived)', balance: 0 });
		expect(accountChoices(chart, 'equity', { today })).toEqual([]);
	});
});

describe('planSaveTransaction', () => {
	const later = new Date('2026-11-10T08:00:00Z');

	it('writes a new Transaction with normalised tags and every field', () => {
		const writes = planSaveTransaction(
			chart,
			draft({
				description: '  Send to GCash ',
				status: 'pending',
				tags: ['Payday', 'payday', 'Q4 2026'],
				from: [{ accountId: 'bpi', amount: '' }],
				fees: [{ accountId: 'bank-fees', amount: '15', mode: 'additional' }]
			}),
			{ id: 'tx9', now: later, today }
		);
		expect(writes).toEqual([
			{
				op: 'setTransaction',
				id: 'tx9',
				data: {
					date: '2026-11-09',
					origin: 'normal',
					description: 'Send to GCash',
					note: '',
					status: 'pending',
					tags: ['payday', 'q4-2026'],
					entries: [
						{ accountId: 'bpi', amount: -501500 },
						{ accountId: 'gcash', amount: 500000 },
						{ accountId: 'bank-fees', amount: 1500, fee: 'additional' }
					],
					accountIds: ['bpi', 'gcash', 'bank-fees'],
					pays: null,
					billOn: null,
					createdAt: later,
					updatedAt: later
				}
			}
		]);
	});

	it('refuses a draft with errors, naming the first one', () => {
		expect(() =>
			planSaveTransaction(chart, draft({ description: '' }), { id: 'tx9', now: later, today })
		).toThrow(/Description/);
	});

	it('keeps the creation time and the paid link when editing, and allows the archived Account kept', () => {
		const existing = chart.transaction('wallet-out')!;
		const [write] = planSaveTransaction(
			chart,
			draft({
				description: 'Spent the old wallet',
				from: [{ accountId: 'old-wallet', amount: '1,000' }],
				to: [{ accountId: 'cash', amount: '' }]
			}),
			{ id: 'wallet-out', now: later, today, existing }
		);
		expect(write).toMatchObject({
			op: 'setTransaction',
			data: { createdAt: now, updatedAt: later, pays: existing.pays }
		});
	});

	it('refuses an edit that leaves an Archived Account with money in it', () => {
		const existing = chart.transaction('wallet-out')!;
		expect(() =>
			planSaveTransaction(
				chart,
				draft({
					from: [{ accountId: 'old-wallet', amount: '600' }],
					to: [{ accountId: 'cash', amount: '' }]
				}),
				{ id: 'wallet-out', now: later, today, existing }
			)
		).toThrow(/archived/i);
	});

	it('refuses to edit an Opening Balance', () => {
		const existing = chart.transaction('opening_bpi')!;
		expect(() =>
			planSaveTransaction(chart, draft(), { id: 'opening_bpi', now: later, today, existing })
		).toThrow(/Opening Balance/);
	});
});

describe('planDeleteTransaction', () => {
	it('deletes an ordinary Transaction', () => {
		expect(planDeleteTransaction(chart, 'lunch')).toEqual([
			{ op: 'deleteTransaction', id: 'lunch' }
		]);
	});

	it('refuses to delete an Opening Balance, or one that leaves an Archived Account with money', () => {
		expect(() => planDeleteTransaction(chart, 'opening_bpi')).toThrow(/Opening Balance/);
		expect(() => planDeleteTransaction(chart, 'wallet-out')).toThrow(/archived/i);
		expect(() => planDeleteTransaction(chart, 'wallet-in')).toThrow(/archived/i);
	});
});

describe('planDeleteTransactions', () => {
	it('deletes several Transactions in one change, skipping repeated ids', () => {
		expect(planDeleteTransactions(chart, ['lunch', 'lunch'])).toEqual([
			{ op: 'deleteTransaction', id: 'lunch' }
		]);
	});

	it('checks Archived Accounts against the whole change', () => {
		// Each alone leaves the archived wallet holding money; together they keep it at zero.
		expect(planDeleteTransactions(chart, ['wallet-in', 'wallet-out'])).toEqual([
			{ op: 'deleteTransaction', id: 'wallet-in' },
			{ op: 'deleteTransaction', id: 'wallet-out' }
		]);
		expect(() => planDeleteTransactions(chart, ['lunch', 'wallet-in'])).toThrow(/archived/i);
	});

	it('refuses Opening Balances, missing Transactions and more than one batch holds', () => {
		expect(() => planDeleteTransactions(chart, ['lunch', 'opening_bpi'])).toThrow(
			/Opening Balance/
		);
		expect(() => planDeleteTransactions(chart, ['gone'])).toThrow(/no longer exists/);
		const many = buildChart(
			chart.all(),
			Array.from({ length: 501 }, (_, i) =>
				tx(`t${i}`, '2026-11-01', [
					['cash', -100],
					['food', 100]
				])
			)
		);
		expect(() =>
			planDeleteTransactions(
				many,
				many.transactions().map((t) => t.id)
			)
		).toThrow(/at most 500/);
	});
});

describe('draftFromTransaction and duplicateDraft', () => {
	const sent = {
		...tx('sent', '2026-11-01', [
			['bpi', -501500],
			['gcash', 500000]
		]),
		note: 'For bills',
		status: 'pending' as const,
		tags: ['payday'],
		entries: [
			{ accountId: 'bpi', amount: -501500 },
			{ accountId: 'gcash', amount: 500000 },
			{ accountId: 'bank-fees', amount: 1500, fee: 'additional' as const }
		],
		pays: { plan: 'scheduled' as const, planId: 'p1', due: '2026-11-01' }
	};

	it('puts fee lines back in the Fees section, with their mode, for editing', () => {
		expect(draftFromTransaction(sent)).toEqual({
			date: '2026-11-01',
			description: 'sent',
			note: 'For bills',
			status: 'pending',
			tags: ['payday'],
			from: [{ accountId: 'bpi', amount: '5015.00' }],
			to: [{ accountId: 'gcash', amount: '5000.00' }],
			fees: [{ accountId: 'bank-fees', amount: '15.00', mode: 'additional' }],
			billOn: null
		});
		expect(evaluateDraft(chart, draftFromTransaction(sent), { today }).entries).toEqual(
			sent.entries
		);
	});

	it('duplicates everything into a cleared draft dated today, with no paid link', () => {
		const copy = duplicateDraft(sent, { today });
		expect(copy).toEqual({ ...draftFromTransaction(sent), date: today, status: 'cleared' });
		const [write] = planSaveTransaction(chart, copy, { id: 'copy', now, today });
		expect(write).toMatchObject({ data: { pays: null, tags: ['payday'], note: 'For bills' } });
	});
});

describe('Bill on: a charge on a Liability billed with a later payment', () => {
	const later = new Date('2026-11-10T08:00:00Z');
	const charge = (billOn: string | null | undefined) =>
		draft({
			description: 'Fan',
			from: [{ accountId: 'cc-bdo', amount: '1,000' }],
			to: [{ accountId: 'food', amount: '1,000' }],
			billOn
		});

	it('applies when a Liability is on the From side', () => {
		expect(canBillLater(chart, charge(null))).toBe(true);
		expect(canBillLater(chart, draft({}))).toBe(false);
	});

	it('saves the bill date, keeping the Transaction date', () => {
		const [w] = planSaveTransaction(chart, charge('2026-11-16'), { id: 'fan', now: later, today });
		expect(w).toMatchObject({ data: { date: '2026-11-09', billOn: '2026-11-16' } });
	});

	it('clears it when emptied, and keeps it when the form leaves it alone', () => {
		const existing = { ...chart.transaction('lunch')!, billOn: '2026-11-20' };
		const keep = planSaveTransaction(
			chart,
			{ ...draftFromTransaction(existing), billOn: undefined },
			{
				id: 'lunch',
				now: later,
				today,
				existing
			}
		);
		expect(keep[0]).toMatchObject({ data: { billOn: '2026-11-20' } });
		const [cleared] = planSaveTransaction(chart, charge(''), { id: 'fan', now: later, today });
		expect(cleared).toMatchObject({ data: { billOn: null } });
	});

	it('refuses a bill date before the Transaction date', () => {
		const ev = evaluateDraft(chart, charge('2026-11-01'), { today });
		expect(ev.errors).toContainEqual({ at: 'billOn', message: 'Bill it on or after the date' });
	});

	it('refuses a bill date when no Liability is charged', () => {
		const ev = evaluateDraft(chart, draft({ billOn: '2026-11-16' }), { today });
		expect(ev.errors).toContainEqual({
			at: 'billOn',
			message: 'Only a charge on a Liability is billed later'
		});
	});

	it('comes back into the form from a stored Transaction', () => {
		const stored = { ...chart.transaction('lunch')!, billOn: '2026-11-20' };
		expect(draftFromTransaction(stored).billOn).toBe('2026-11-20');
	});
});
