import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	evaluateInstallmentDraft,
	planCreateInstallmentFromDraft,
	takeOnDraft,
	type InstallmentDraft
} from './installment-create.ts';
import type { Installment } from './schemas.ts';
import { account, opening, roots, tx } from './test-fixtures.ts';

const peso = (p: number) => Math.round(p * 100);
const today = '2026-11-10';
const startedOn = '2026-10-01';
const accounts = [
	...roots,
	account('bpi', 'asset', 'asset'),
	account('loan-money', 'asset', 'asset'),
	account('rcbc-jcb', 'liability', 'liability', { name: 'RCBC JCB' }),
	account('cards', 'liability', 'liability', { name: 'Cards' }),
	account('ub', 'liability', 'cards', { name: 'UB' }),
	account('finance', 'expense', 'expense', { name: 'Finance charges' }),
	account('gadgets', 'expense', 'expense')
];
// RCBC JCB is a card Leaf with spending on it.
const spending = tx('lunch', '2026-11-01', [
	['gadgets', 50000],
	['rcbc-jcb', -50000]
]);
const chart = buildChart(accounts, [opening('bpi', 1000000), spending]);

/** The sheet's ANV15 JCB: ₱45,999 over 12 months from 15 Sep 2026, under the RCBC JCB card. */
const jcb: InstallmentDraft = {
	kind: 'lender',
	title: 'ANV15 JCB',
	note: '',
	tags: ['anv15-jcb'],
	purchaseDate: '2026-08-24',
	firstDate: '2026-09-15',
	repeat: 'monthly',
	everyWeeks: 2,
	count: 12,
	rowZero: false,
	entry: 'flat',
	amount: '45999',
	interest: '',
	varied: [],
	additionals: {},
	trackedFrom: null,
	liability: { mode: 'new', parentId: 'rcbc-jcb', name: 'ANV15 JCB', historyName: 'Card spending' },
	inCardBalance: true,
	repaidAssetId: '',
	payingId: 'rcbc-jcb',
	interestId: '',
	feesId: ''
};
const evaluate = (d: Partial<InstallmentDraft>, plans: Installment[] = []) =>
	evaluateInstallmentDraft(chart, plans, { ...jcb, ...d }, { today, startedOn });
const at = (d: Partial<InstallmentDraft>, plans: Installment[] = []) =>
	evaluate(d, plans).errors.map((e) => e.at);

describe('evaluateInstallmentDraft', () => {
	it('previews flat rows and tracks from the first row on or after the day Perancial started', () => {
		const ev = evaluate({});
		expect(ev.errors).toEqual([]);
		expect(ev.rows).toHaveLength(12);
		expect(ev.rows[0]).toMatchObject({ n: 1, date: '2026-09-15', principal: peso(3833.25) });
		expect(ev.rule).toEqual({ type: 'monthly', day: 15, start: '2026-09-15' });
		expect(ev.inProgress).toBe(true);
		expect(ev.trackedFrom).toBe(2);
		expect(ev.trackedPrincipal).toBe(peso(45999 - 3833.25));
		expect(ev.parentHoldsMoney).toBe(true);
	});

	it('is not in progress when the first payment is today or later, and tracks every row', () => {
		const ev = evaluate({ firstDate: '2026-11-15', trackedFrom: 5 });
		expect([ev.inProgress, ev.trackedFrom]).toEqual([false, 1]);
	});

	it('keeps a tracked-from row the user chose', () => {
		expect(evaluate({ trackedFrom: 4 }).trackedFrom).toBe(4);
	});

	it('takes each row as typed in a varied plan, with additionals by row number', () => {
		const ev = evaluate({
			entry: 'varied',
			count: 2,
			rowZero: true,
			firstDate: '2026-12-09',
			varied: [
				{ principal: '0', interest: '152.63' },
				{ principal: '918.74', interest: '169.59' },
				{ principal: '931.80', interest: '156.53' }
			],
			additionals: { 0: [{ description: 'Processing Fee', amount: '250' }] }
		});
		expect(ev.errors).toEqual([]);
		expect(ev.rows.map((r) => [r.n, r.date, r.principal, r.interest])).toEqual([
			[0, '2026-12-09', 0, peso(152.63)],
			[1, '2027-01-09', peso(918.74), peso(169.59)],
			[2, '2027-02-09', peso(931.8), peso(156.53)]
		]);
		expect(ev.rows[0].additionals).toEqual([{ description: 'Processing Fee', amount: peso(250) }]);
	});

	it('points each problem at its field', () => {
		expect(at({ title: ' ' })).toEqual(['title']);
		expect(at({ amount: 'abc' })).toEqual(['amount']);
		expect(at({ count: 0 })).toEqual(['count']);
		expect(at({ entry: 'varied', count: 1, varied: [{ principal: 'x', interest: '' }] })).toEqual([
			'rows.0.principal'
		]);
		expect(at({ additionals: { 3: [{ description: '', amount: '10' }] } })).toEqual([
			'additionals.3.0'
		]);
		expect(at({ payingId: '' })).toEqual(['paying']);
		expect(at({ interestId: 'bpi' })).toEqual(['interest']);
		expect(
			at({ liability: { ...jcb.liability, name: '' } as InstallmentDraft['liability'] })
		).toEqual(['liability']);
		expect(
			at({ liability: { mode: 'new', parentId: 'bpi', name: 'X', historyName: 'Y' } })
		).toEqual(['liability']);
		expect(
			at({ liability: { mode: 'new', parentId: 'rcbc-jcb', name: 'X', historyName: '' } })
		).toEqual(['liability']);
	});

	it('lets a picked Liability serve one plan only, and an internal plan needs an Asset', () => {
		const taken = {
			id: 'p',
			title: 'UB plan',
			kind: 'lender',
			accounts: { repaid: 'ub' }
		} as Installment;
		expect(at({ liability: { mode: 'pick', accountId: 'ub' } }, [taken])).toEqual(['liability']);
		expect(at({ liability: { mode: 'pick', accountId: 'ub' } })).toEqual([]);
		expect(at({ kind: 'internal', repaidAssetId: 'loan-money', payingId: 'bpi' })).toEqual([]);
		expect(at({ kind: 'internal', repaidAssetId: 'rcbc-jcb', payingId: 'bpi' })).toEqual([
			'repaid'
		]);
	});
});

describe('planCreateInstallmentFromDraft', () => {
	const later = new Date('2026-11-10T00:00:00Z');
	const ids = () => {
		let n = 0;
		return () => `new${++n}`;
	};
	const create = (d: Partial<InstallmentDraft>, c = chart, plans: Installment[] = []) =>
		planCreateInstallmentFromDraft(
			c,
			plans,
			{ ...jcb, ...d },
			{
				today,
				startedOn,
				now: later,
				planId: 'plan',
				newId: ids()
			}
		);
	const ops = (r: ReturnType<typeof create>) =>
		r.writes.map((w) =>
			w.op === 'setAccount'
				? [w.op, w.id, w.data.name, w.data.parentId]
				: w.op === 'setTransaction'
					? [w.op, w.id, w.data.entries.map((e) => [e.accountId, e.amount])]
					: [w.op, w.id]
		);

	it("splits a card Leaf with spending: its history keeps its ID, the plan's Leaf sits beside it", () => {
		const r = create({});
		expect(ops(r)).toEqual([
			['setAccount', 'new1', 'RCBC JCB', 'liability'],
			['setAccount', 'rcbc-jcb', 'Card spending', 'new1'],
			['setAccount', 'new2', 'ANV15 JCB', 'new1'],
			['setInstallment', 'plan']
		]);
		expect(r).toMatchObject({ planId: 'plan', liabilityId: 'new2', historyId: 'rcbc-jcb' });
		const plan = r.writes.at(-1)!;
		expect(plan.op === 'setInstallment' && plan.data).toMatchObject({
			kind: 'lender',
			title: 'ANV15 JCB',
			tags: ['anv15-jcb'],
			entry: 'flat',
			trackedFrom: 2,
			accounts: { repaid: 'new2', paying: 'rcbc-jcb', interest: 'finance', fees: 'finance' },
			createdAt: later
		});
	});

	it("gives the new Liability an Opening Balance of tracked principal when the card's balance doesn't hold it", () => {
		expect(ops(create({ inCardBalance: false }))).toContainEqual([
			'setTransaction',
			'opening_new2',
			[
				['new2', -peso(45999 - 3833.25)],
				['opening-balances', peso(45999 - 3833.25)]
			]
		]);
	});

	it('creates Expenses › Finance charges when none exists, and nothing else under a Group', () => {
		const bare = buildChart(
			accounts.filter((a) => a.id !== 'finance'),
			[]
		);
		const r = create(
			{
				liability: { mode: 'new', parentId: 'cards', name: 'UB Paydirect', historyName: '' },
				firstDate: '2026-11-30'
			},
			bare
		);
		expect(ops(r)).toEqual([
			['setAccount', 'new1', 'UB Paydirect', 'cards'],
			['setAccount', 'new2', 'Finance charges', 'expense'],
			['setInstallment', 'plan']
		]);
	});

	it('writes only the plan for a picked Liability or an internal plan', () => {
		expect(ops(create({ liability: { mode: 'pick', accountId: 'ub' } }))).toEqual([
			['setInstallment', 'plan']
		]);
		const internal = create({ kind: 'internal', repaidAssetId: 'loan-money', payingId: 'bpi' });
		expect(ops(internal)).toEqual([['setInstallment', 'plan']]);
		const plan = internal.writes[0];
		expect(plan.op === 'setInstallment' && plan.data.accounts).toEqual({
			repaid: 'loan-money',
			paying: 'bpi',
			interest: null,
			fees: null
		});
	});

	it('refuses a draft with errors', () => {
		expect(() => create({ title: '' })).toThrow(/title/);
	});
});

describe('takeOnDraft', () => {
	const later = new Date('2026-11-10T00:00:00Z');
	const made = (d: Partial<InstallmentDraft>) => {
		const w = planCreateInstallmentFromDraft(
			chart,
			[],
			{ ...jcb, ...d },
			{
				today,
				startedOn,
				now: later,
				planId: 'plan',
				newId: () => 'leaf'
			}
		).writes.at(-1)!;
		if (w.op !== 'setInstallment') throw new Error('expected the plan');
		return { id: 'plan', ...w.data };
	};
	const fresh = made({ firstDate: '2026-11-15', liability: { mode: 'pick', accountId: 'ub' } });

	it('a new purchase: the whole principal leaves the Liability, To left for the user', () => {
		expect(takeOnDraft(fresh, 'purchase', { today })).toEqual({
			date: '2026-08-24',
			description: 'ANV15 JCB',
			note: '',
			status: 'cleared',
			tags: ['anv15-jcb'],
			from: [{ accountId: 'ub', amount: '45999.00' }],
			to: [{ accountId: '', amount: '' }],
			fees: []
		});
	});

	it("moving the debt off the card: tracked principal from the plan's Liability to the card, today", () => {
		const inProgress = made({ liability: { mode: 'pick', accountId: 'ub' } });
		expect(takeOnDraft(inProgress, 'move-debt', { today, to: 'rcbc-jcb' })).toMatchObject({
			date: today,
			description: 'ANV15 JCB: moved from the card',
			from: [{ accountId: 'ub', amount: '42165.75' }],
			to: [{ accountId: 'rcbc-jcb', amount: '' }]
		});
	});

	it("an internal plan's card payment: the principal leaves the repaid Asset", () => {
		const internal = made({
			kind: 'internal',
			repaidAssetId: 'loan-money',
			payingId: 'bpi',
			firstDate: '2026-11-15'
		});
		expect(takeOnDraft(internal, 'card-payment', { today })).toMatchObject({
			date: '2026-08-24',
			description: 'ANV15 JCB: card payment',
			from: [{ accountId: 'loan-money', amount: '45999.00' }],
			to: [{ accountId: '', amount: '' }]
		});
	});
});
