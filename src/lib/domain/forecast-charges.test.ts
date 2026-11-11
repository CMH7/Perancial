import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	plannedChargeDraft,
	plannedCharges,
	planRecordCharges,
	planUndoRecord,
	recordedWith
} from './forecast-charges.ts';
import type { Installment, Scheduled } from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const accounts = [
	...roots,
	account('everyday', 'asset', 'asset'),
	account('card', 'liability', 'liability'),
	account('loan', 'liability', 'liability'),
	account('food', 'expense', 'expense'),
	account('finance', 'expense', 'expense')
];
const plan = (
	id: string,
	description: string,
	rule: Scheduled['versions'][0]['rule'],
	lines: Scheduled['versions'][0]['lines'],
	extra: Partial<Scheduled> = {}
): Scheduled => ({
	id,
	versions: [
		{
			from: rule.type === 'once' ? rule.date : rule.start,
			description,
			note: '',
			tags: ['subs'],
			lines,
			rule
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now,
	...extra
});
// The card is paid on the 25th; charges since the 25th before are billed with it.
const cardPay = plan('cardpay', 'Pay card', { type: 'monthly', day: 25, start: '2026-10-25' }, [
	{ accountId: 'everyday', side: 'from', amount: null },
	{ accountId: 'card', side: 'to', amount: null }
]);
const music = plan('music', 'Music', { type: 'monthly', day: 12, start: '2026-10-12' }, [
	{ accountId: 'card', side: 'from', amount: 15_000 },
	{ accountId: 'food', side: 'to', amount: 15_000 }
]);
const cloud = plan('cloud', 'Cloud', { type: 'monthly', day: 20, start: '2026-10-20' }, [
	{ accountId: 'card', side: 'from', amount: null },
	{ accountId: 'food', side: 'to', amount: null }
]);
const gym = plan('gym', 'Gym', { type: 'monthly', day: 3, start: '2026-11-03' }, [
	{ accountId: 'card', side: 'from', amount: 50_000 },
	{ accountId: 'food', side: 'to', amount: 50_000 }
]);
const laptop: Installment = {
	id: 'laptop',
	kind: 'lender',
	title: 'Laptop',
	note: '',
	tags: [],
	purchaseDate: '2026-10-01',
	entry: 'flat',
	rule: { type: 'monthly', day: 15, start: '2026-11-15' },
	trackedFrom: 1,
	accounts: { repaid: 'loan', paying: 'card', interest: 'finance', fees: 'finance' },
	rows: [
		{
			n: 1,
			due: '2026-11-15',
			date: '2026-11-15',
			principal: 200_000,
			interest: 0,
			additionals: []
		}
	],
	createdAt: now,
	updatedAt: now
};
// Gym for 3 Nov is already recorded.
const gymPaid = tx('gym-nov', '2026-11-03', [
	['food', 50_000],
	['card', -50_000]
]);
const chart = buildChart(accounts, [
	{ ...gymPaid, pays: { plan: 'scheduled', planId: 'gym', due: '2026-11-03' } }
]);
const input = { chart, scheduled: [cardPay, music, cloud, gym], installments: [laptop] };

describe('Planned charges recorded with a Liability payment', () => {
	const list = plannedCharges(input, 'card', '2026-11-25', { today: '2026-11-18' });

	it('lists the unpaid planned charges billed with the payment, oldest first', () => {
		expect(list.map((c) => c.label)).toEqual(['Music', '[Ins 1/1] Laptop', 'Cloud']);
	});

	it('drafts each on its own date, from the Liability, linked to what it records', () => {
		const m = list[0];
		expect(m).toMatchObject({
			date: '2026-11-12',
			amount: 15_000,
			pays: { plan: 'scheduled', planId: 'music', due: '2026-11-12' }
		});
		expect(m.draft).toMatchObject({
			date: '2026-11-12',
			description: 'Music',
			tags: ['subs'],
			from: [{ accountId: 'card', amount: '150.00' }],
			to: [{ accountId: 'food', amount: '150.00' }]
		});
		expect(m.blocked).toBeUndefined();
	});

	it('drafts an Installment Row paid with the card on the row date', () => {
		const row = list[1];
		expect(row).toMatchObject({
			date: '2026-11-15',
			amount: 200_000,
			pays: { plan: 'installment', planId: 'laptop', due: '2026-11-15' }
		});
		expect(row.draft.date).toBe('2026-11-15');
	});

	it("can't record one dated after today, or one with no amount", () => {
		expect(list[2]).toMatchObject({ label: 'Cloud', amount: null, blocked: 'later' });
		const early = plannedCharges(input, 'card', '2026-11-25', { today: '2026-11-21' });
		expect(early[2]).toMatchObject({ label: 'Cloud', blocked: 'amount' });
	});

	it('records with a changed amount on one From and one To line', () => {
		const d = plannedChargeDraft(list[0], 17_250);
		expect(d.from).toEqual([{ accountId: 'card', amount: '172.50' }]);
		expect(d.to).toEqual([{ accountId: 'food', amount: '172.50' }]);
		expect(plannedChargeDraft(list[0], 15_000)).toBe(list[0].draft);
	});

	it('writes one linked Transaction per charge', () => {
		const writes = planRecordCharges(chart, [{ charge: list[0], amount: 15_000, id: 't1' }], {
			now,
			today: '2026-11-18'
		});
		expect(writes).toEqual([
			expect.objectContaining({
				op: 'setTransaction',
				id: 't1',
				data: expect.objectContaining({
					date: '2026-11-12',
					status: 'cleared',
					pays: { plan: 'scheduled', planId: 'music', due: '2026-11-12' }
				})
			})
		]);
	});
});

describe('Undoing a recorded Liability payment', () => {
	const list = plannedCharges(input, 'card', '2026-11-25', { today: '2026-11-18' });

	it('links each charge recorded with it to the payment', () => {
		const [w] = planRecordCharges(chart, [{ charge: list[0], amount: 15_000, id: 't1' }], {
			now,
			today: '2026-11-18',
			recordedWith: 'pay1'
		});
		expect(w).toMatchObject({ data: { recordedWith: 'pay1' } });
	});

	const payment = {
		...tx('pay1', '2026-11-18', [
			['card', 15_000],
			['everyday', -15_000]
		]),
		pays: { plan: 'scheduled' as const, planId: 'cardpay', due: '2026-11-25' }
	};
	const musicTx = {
		...tx('t1', '2026-11-12', [
			['food', 15_000],
			['card', -15_000]
		]),
		pays: { plan: 'scheduled' as const, planId: 'music', due: '2026-11-12' },
		recordedWith: 'pay1'
	};
	const books = buildChart(accounts, [payment, musicTx, gymPaid]);

	it('finds the charges recorded with a payment', () => {
		expect(recordedWith(books, 'pay1').map((t) => t.id)).toEqual(['t1']);
	});

	it('deletes the payment and the charges recorded with it, nothing else', () => {
		const writes = planUndoRecord(books, 'pay1', { now, plans: input.scheduled });
		expect(writes).toEqual([
			{ op: 'deleteTransaction', id: 'pay1' },
			{ op: 'deleteTransaction', id: 't1' }
		]);
	});
});
