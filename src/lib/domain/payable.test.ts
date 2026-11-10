import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { clearSettledWhenGone, clearSettledWithLastPayment, paymentsFor } from './payable.ts';
import type { Installment, PaidLink, Transaction } from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const accounts = [
	...roots,
	account('bpi', 'asset', 'asset'),
	account('anv15', 'liability', 'liability')
];
const due = '2026-11-15';
const pay = (id: string, pays: PaidLink): Transaction => ({
	...tx(id, due, [
		['bpi', -233333],
		['anv15', 233333]
	]),
	pays
});
const row = { n: 1, due, date: due, principal: 233333, interest: 0, additionals: [] };
const visa: Installment = {
	id: 'visa',
	kind: 'lender',
	title: 'ANV15 VISA',
	note: '',
	tags: [],
	purchaseDate: '2026-08-24',
	entry: 'flat',
	rule: { type: 'monthly', day: 15, start: due },
	trackedFrom: 1,
	accounts: { repaid: 'anv15', paying: 'bpi', interest: 'finance', fees: 'finance' },
	rows: [
		{ ...row, settled: true },
		{ ...row, n: 2, due: '2026-12-15', date: '2026-12-15' }
	],
	createdAt: now,
	updatedAt: now
};

describe('paymentsFor', () => {
	it('counts only Transactions naming the same plan kind, plan and due date', () => {
		const chart = buildChart(accounts, [
			pay('row', { plan: 'installment', planId: 'visa', due }),
			pay('other-kind', { plan: 'scheduled', planId: 'visa', due }),
			pay('other-row', { plan: 'installment', planId: 'visa', due: '2026-12-15' })
		]);
		expect(
			paymentsFor(chart, { plan: 'installment', planId: 'visa', due }).map((t) => t.id)
		).toEqual(['row']);
	});
});

describe('clearSettledWithLastPayment for Installment Plan rows', () => {
	const only = pay('only', { plan: 'installment', planId: 'visa', due });

	it('clears Mark paid on the row when its last payment goes', () => {
		const writes = clearSettledWithLastPayment(buildChart(accounts, [only]), only, [visa], now);
		expect(writes).toHaveLength(1);
		const w = writes[0];
		expect(w.op === 'setInstallment' && w.data.rows[0].settled).toBeFalsy();
		expect(w.op === 'setInstallment' && w.data.rows[1]).toEqual(visa.rows[1]);
	});

	it('keeps it while another payment remains', () => {
		const other = pay('other', { plan: 'installment', planId: 'visa', due });
		expect(
			clearSettledWithLastPayment(buildChart(accounts, [only, other]), only, [visa], now)
		).toEqual([]);
	});
});

describe('clearSettledWhenGone (several Transactions deleted together)', () => {
	const a = pay('a', { plan: 'installment', planId: 'visa', due });
	const b = pay('b', { plan: 'installment', planId: 'visa', due });

	it('clears Mark paid once when every payment of the row goes in the same change', () => {
		const chart = buildChart(accounts, [a, b]);
		const writes = clearSettledWhenGone(chart, [a, b], [visa], now);
		expect(writes).toHaveLength(1);
		const w = writes[0];
		expect(w.op === 'setInstallment' && w.data.rows[0].settled).toBeFalsy();
	});

	it('keeps it while a payment outside the change remains', () => {
		const chart = buildChart(accounts, [a, b]);
		expect(clearSettledWhenGone(chart, [a], [visa], now)).toEqual([]);
	});

	it('writes one plan once, with every row it clears', () => {
		const second = '2026-12-15';
		const both: Installment = {
			...visa,
			rows: [visa.rows[0], { ...visa.rows[1], settled: true }]
		};
		const c = pay('c', { plan: 'installment', planId: 'visa', due: second });
		const chart = buildChart(accounts, [a, c]);
		const writes = clearSettledWhenGone(chart, [a, c], [both], now);
		expect(writes).toHaveLength(1);
		const w = writes[0];
		expect(w.op === 'setInstallment' && w.data.rows.map((r) => r.settled ?? false)).toEqual([
			false,
			false
		]);
	});
});
