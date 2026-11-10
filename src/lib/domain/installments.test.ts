import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	flatRows,
	planAddRow,
	planDeleteInstallment,
	planEditRow,
	planMarkRowPaid,
	planRemoveRow,
	planSaveInstallment,
	planSummary,
	rowStatuses
} from './installments.ts';
import type { Installment, Transaction } from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const peso = (p: number) => Math.round(p * 100);
const today = '2026-11-10';
const accounts = [
	...roots,
	account('bpi', 'asset', 'asset'),
	account('claude-loan', 'liability', 'liability'),
	account('finance', 'expense', 'expense'),
	account('loan-money', 'asset', 'asset'),
	account('cards', 'liability', 'liability'),
	account('jcb', 'liability', 'cards')
];

// The sheet's "Claude" plan: varied, a row 0 with a ₱250 processing fee, rows 0–8 paid before
// Perancial (Before tracking).
const principal = [
	0, 918.74, 931.8, 945.05, 958.48, 972.11, 985.93, 999.95, 1014.16, 1028.58, 1043.2, 1058.03,
	1073.04
];
const interest = [
	152.63, 169.59, 156.53, 143.28, 129.85, 116.22, 102.4, 88.38, 74.17, 59.75, 45.13, 30.3, 15.29
];
const month = (i: number) => {
	const d = new Date(Date.UTC(2026, 1 + i, 9));
	return d.toISOString().slice(0, 10);
};
const claude: Installment = {
	id: 'claude',
	kind: 'lender',
	title: 'Claude',
	note: '',
	tags: [],
	purchaseDate: '2026-01-12',
	entry: 'varied',
	rule: { type: 'monthly', day: 9, start: '2026-02-09' },
	trackedFrom: 9,
	accounts: { repaid: 'claude-loan', paying: 'bpi', interest: 'finance', fees: 'finance' },
	rows: principal.map((p, i) => ({
		n: i,
		due: month(i),
		date: month(i),
		principal: peso(p),
		interest: peso(interest[i]),
		additionals: i === 0 ? [{ description: 'Processing Fee', amount: peso(250) }] : []
	})),
	createdAt: now,
	updatedAt: now
};
const payment = (id: string, due: string, amount: number): Transaction => ({
	...tx(id, today, [
		['bpi', -amount],
		['claude-loan', amount]
	]),
	pays: { plan: 'installment', planId: 'claude', due }
});

describe('flatRows', () => {
	it('splits the amount evenly and puts the rounding remainder in the last principal', () => {
		// The sheet's ANV15 VISA: ₱28,000 over 12 months from 15 Nov 2026.
		const rows = flatRows({
			amount: peso(28000),
			count: 12,
			interest: 0,
			rule: { type: 'monthly', day: 15, start: '2026-11-15' }
		});
		expect(rows).toHaveLength(12);
		expect(rows.slice(0, 11).every((r) => r.principal === peso(2333.33))).toBe(true);
		expect(rows[11]).toEqual({
			n: 12,
			due: '2027-10-15',
			date: '2027-10-15',
			principal: peso(2333.37),
			interest: 0,
			additionals: []
		});
	});

	it('clamps a day past month end, as the sheet does for UB Paydirect', () => {
		const rows = flatRows({
			amount: peso(6500),
			count: 5,
			interest: 0,
			rule: { type: 'monthly', day: 30, start: '2026-11-30' }
		});
		expect(rows.map((r) => r.date)).toEqual([
			'2026-11-30',
			'2026-12-30',
			'2027-01-30',
			'2027-02-28',
			'2027-03-30'
		]);
		expect(rows.map((r) => r.principal)).toEqual(Array(5).fill(peso(1300)));
	});

	it('starts with an interest/fee-only row 0 on the first date when asked', () => {
		const rows = flatRows({
			amount: peso(1200),
			count: 2,
			interest: peso(10),
			rule: { type: 'monthly', day: 9, start: '2026-02-09' },
			rowZero: true
		});
		expect(rows.map((r) => [r.n, r.date, r.principal, r.interest])).toEqual([
			[0, '2026-02-09', 0, 0],
			[1, '2026-03-09', peso(600), peso(10)],
			[2, '2026-04-09', peso(600), peso(10)]
		]);
	});
});

describe('rowStatuses and planSummary', () => {
	it("match the sheet's Grand total and Balance, with rows 0–8 Before tracking", () => {
		const chart = buildChart(accounts, []);
		const rows = rowStatuses(chart, claude, { today });
		expect(rows.slice(0, 9).every((r) => r.state === 'before' && !r.overdue)).toBe(true);
		expect(rows[9]).toMatchObject({ state: 'unpaid', overdue: true, total: peso(1088.33) });
		expect(rows[10]).toMatchObject({ state: 'unpaid', overdue: false });

		const s = planSummary(chart, claude, { today });
		expect(s.amount).toBe(peso(11929.07));
		expect(s.grandTotal).toBe(peso(13462.59));
		expect(s.balance).toBe(peso(4353.32));
		expect(s.unpaidPrincipal).toBe(peso(4202.85));
		expect(s.interest).toEqual({
			scheduled: peso(1283.52),
			paid: peso(1133.05),
			before: peso(1133.05)
		});
		expect(s.additionals).toEqual({ scheduled: peso(250), paid: peso(250), before: peso(250) });
		expect(s.next?.row.n).toBe(9);
		expect([s.doneRows, s.rowCount]).toEqual([9, 13]);
	});

	it('count paid and partly paid rows from their linked Transactions', () => {
		const chart = buildChart(accounts, [
			payment('full', month(9), peso(1088.33)),
			payment('part', month(10), peso(500))
		]);
		const rows = rowStatuses(chart, claude, { today });
		expect(rows[9]).toMatchObject({ state: 'paid', overdue: false, remaining: 0 });
		expect(rows[10]).toMatchObject({ state: 'partly-paid', remaining: peso(588.33) });

		const s = planSummary(chart, claude, { today });
		expect(s.balance).toBe(peso(4353.32 - 1088.33 - 500));
		expect(s.unpaidPrincipal).toBe(peso(4202.85 - 1028.58));
		expect(s.interest.paid).toBe(peso(1133.05 + 59.75));
		expect(s.next?.row.n).toBe(10);
	});

	it('treat a marked-paid row as paid', () => {
		const settled = {
			...claude,
			rows: claude.rows.map((r) => (r.n === 9 ? { ...r, settled: true } : r))
		};
		const chart = buildChart(accounts, [payment('part', month(9), peso(1000))]);
		expect(rowStatuses(chart, settled, { today })[9]).toMatchObject({
			state: 'paid',
			remaining: 0
		});
	});
});

describe('planSaveInstallment', () => {
	const later = new Date('2026-11-10T00:00:00Z');
	const { id: _id, createdAt: _c, updatedAt: _u, ...terms } = claude;
	const save = (patch: Partial<typeof terms>, plans: Installment[] = [], txs: Transaction[] = []) =>
		planSaveInstallment(
			buildChart(accounts, txs),
			plans,
			'new',
			{ ...terms, ...patch },
			{ now: later }
		);

	it('writes a new plan with both timestamps', () => {
		expect(save({})).toEqual([
			{ op: 'setInstallment', id: 'new', data: { ...terms, createdAt: later, updatedAt: later } }
		]);
	});

	it('keeps createdAt when saving an existing plan', () => {
		const writes = planSaveInstallment(buildChart(accounts, []), [claude], 'claude', terms, {
			now: later
		});
		expect(writes[0]).toMatchObject({ data: { createdAt: now, updatedAt: later } });
	});

	it('needs the right kind of Accounts for each plan kind', () => {
		expect(() => save({ accounts: { ...terms.accounts, repaid: 'bpi' } })).toThrow(/Liability/);
		expect(() => save({ accounts: { ...terms.accounts, repaid: 'cards' } })).toThrow(/Leaf/);
		expect(() => save({ accounts: { ...terms.accounts, interest: 'bpi' } })).toThrow(/Expense/);
		expect(() => save({ accounts: { ...terms.accounts, paying: 'cards' } })).toThrow(/Leaf/);
		const internal = { repaid: 'loan-money', paying: 'bpi', interest: null, fees: null };
		expect(save({ kind: 'internal', accounts: internal })).toHaveLength(1);
		expect(() => save({ kind: 'internal', accounts: { ...internal, repaid: 'jcb' } })).toThrow(
			/Asset/
		);
		expect(() =>
			save({ kind: 'internal', accounts: { ...internal, interest: 'finance' } })
		).toThrow(/Internal/);
		expect(() => save({ accounts: { ...terms.accounts, fees: null } })).toThrow(/Fees/);
	});

	it('lets a Liability serve one plan only, while internal plans may share an Asset', () => {
		expect(() => save({}, [claude])).toThrow(/already/);
		const internal = { repaid: 'loan-money', paying: 'bpi', interest: null, fees: null };
		const laptop = { ...claude, id: 'laptop', kind: 'internal' as const, accounts: internal };
		expect(save({ kind: 'internal', accounts: internal }, [laptop])).toHaveLength(1);
	});

	it('needs unique due dates, rows in date order, and some principal', () => {
		const [a, b] = terms.rows;
		expect(() => save({ rows: [a, { ...b, due: a.due }] })).toThrow(/due/);
		expect(() =>
			save({
				rows: [
					{ ...a, date: b.date },
					{ ...b, date: a.date }
				]
			})
		).toThrow(/order/);
		expect(() => save({ rows: [a] })).toThrow(/principal/);
	});

	it('never drops a row that Transactions pay', () => {
		const paid = payment('p', month(12), peso(1088.33));
		expect(() =>
			planSaveInstallment(
				buildChart(accounts, [paid]),
				[claude],
				'claude',
				{ ...terms, rows: terms.rows.slice(0, 12) },
				{ now: later }
			)
		).toThrow(/pay/);
	});
});

describe('row edits', () => {
	const later = new Date('2026-11-10T00:00:00Z');
	const visa: Installment = {
		...claude,
		id: 'visa',
		title: 'ANV15 VISA',
		entry: 'flat',
		trackedFrom: 1,
		rule: { type: 'monthly', day: 30, start: '2026-11-30' },
		rows: flatRows({
			amount: peso(6500),
			count: 5,
			interest: 0,
			rule: { type: 'monthly', day: 30, start: '2026-11-30' }
		})
	};
	const saved = (writes: ReturnType<typeof planEditRow>) => {
		const w = writes[0];
		if (w.op !== 'setInstallment') throw new Error('expected a plan write');
		return w.data;
	};
	const chart = (txs: Transaction[] = []) => buildChart(accounts, txs);
	const paid = (due: string) => ({
		...payment('p', due, peso(1300)),
		pays: { plan: 'installment' as const, planId: 'visa', due }
	});

	it('editing one row changes only that row and makes a flat plan varied', () => {
		const data = saved(
			planEditRow(
				chart(),
				[visa],
				visa,
				'2026-12-30',
				{ principal: peso(1000), interest: peso(5) },
				{ now: later }
			)
		);
		expect(data.entry).toBe('varied');
		expect(data.rows[1]).toMatchObject({ principal: peso(1000), interest: peso(5) });
		expect(data.rows[0]).toEqual(visa.rows[0]);
	});

	it('moving a row keeps its due date as identity', () => {
		const data = saved(
			planEditRow(chart(), [visa], visa, '2026-12-30', { date: '2027-01-02' }, { now: later })
		);
		expect(data.rows[1]).toMatchObject({ due: '2026-12-30', date: '2027-01-02' });
	});

	it('adds a row at the end on the next rule date, copying the last amounts', () => {
		const data = saved(planAddRow(chart(), [visa], visa, { now: later }));
		expect(data.rows.at(-1)).toEqual({
			n: 6,
			due: '2027-04-30',
			date: '2027-04-30',
			principal: peso(1300),
			interest: 0,
			additionals: []
		});
	});

	it('removes the last row, unless Transactions pay it', () => {
		expect(saved(planRemoveRow(chart(), [visa], visa, { now: later })).rows).toHaveLength(4);
		expect(() => planRemoveRow(chart([paid('2027-03-30')]), [visa], visa, { now: later })).toThrow(
			/unlink/
		);
	});

	it('Mark paid needs a payment; Mark unpaid clears it', () => {
		expect(() =>
			planMarkRowPaid(chart(), [visa], visa, '2026-11-30', true, { now: later })
		).toThrow(/paying/);
		const c = chart([paid('2026-11-30')]);
		const marked = saved(planMarkRowPaid(c, [visa], visa, '2026-11-30', true, { now: later }));
		expect(marked.rows[0].settled).toBe(true);
		const plan = { ...visa, rows: marked.rows };
		expect(
			saved(planMarkRowPaid(c, [plan], plan, '2026-11-30', false, { now: later })).rows[0]
		).toEqual(visa.rows[0]);
	});

	it('deletes a plan only while nothing pays it', () => {
		expect(planDeleteInstallment(chart(), 'visa')).toEqual([
			{ op: 'deleteInstallment', id: 'visa' }
		]);
		expect(() => planDeleteInstallment(chart([paid('2026-11-30')]), 'visa')).toThrow(/pay/);
	});
});
