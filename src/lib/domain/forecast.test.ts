import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	buildForecast,
	cutoffWindow,
	DEFAULT_FORECAST_SECTIONS,
	fundedWindow,
	fundingAccountsFor,
	fundingCutoffOf,
	forecastAccountUsers,
	nextCutoff,
	planSetFundingAccounts,
	previousCutoff,
	type ForecastInput
} from './forecast.ts';
import type {
	Forecast,
	Installment,
	PlanLine,
	RepeatRule,
	Scheduled,
	Transaction
} from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

// Made-up figures in centavos; the owner's real numbers never go in tests.
const accounts = [
	...roots,
	account('payroll', 'asset', 'asset'),
	account('everyday', 'asset', 'asset'),
	account('reserve', 'asset', 'asset'),
	account('savings', 'asset', 'asset'),
	account('ewallet', 'asset', 'asset'),
	account('friend', 'asset', 'asset', { name: 'Owed by a friend' }),
	account('card', 'liability', 'liability', { name: 'Card X' }),
	account('loan', 'liability', 'liability'),
	account('salary', 'income', 'income'),
	account('food', 'expense', 'expense'),
	account('internet', 'expense', 'expense'),
	account('insurance', 'expense', 'expense'),
	account('finance', 'expense', 'expense')
];

const line = (accountId: string, side: 'from' | 'to', amount: number | null): PlanLine => ({
	accountId,
	side,
	amount
});

function plan(
	id: string,
	description: string,
	rule: RepeatRule,
	lines: PlanLine[],
	extra: Partial<Scheduled> = {}
): Scheduled {
	const start = rule.type === 'once' ? rule.date : rule.start;
	return {
		id,
		versions: [{ from: start, description, note: '', tags: [], lines, rule }],
		end: { type: 'never' },
		occurrences: {},
		createdAt: now,
		updatedAt: now,
		...extra
	};
}

const pay = plan(
	'pay',
	'Pay',
	{ type: 'cutoff', start: '2026-11-15' },
	[line('salary', 'from', null), line('payroll', 'to', null)],
	{ occurrences: { '2026-11-15': { amounts: [2_000_000, 2_000_000] } } }
);
const move = plan(
	'move',
	'Move pay to Everyday',
	{ type: 'monthly', day: 16, start: '2026-11-16' },
	[line('payroll', 'from', 1_500_000), line('everyday', 'to', 1_500_000)]
);
const internet = plan('internet', 'Internet', { type: 'monthly', day: 8, start: '2026-11-08' }, [
	line('everyday', 'from', 150_000),
	line('internet', 'to', 150_000)
]);
const cardPay = plan(
	'cardpay',
	'Card X payment',
	{ type: 'monthly', day: 25, start: '2026-11-25' },
	[line('everyday', 'from', null), line('card', 'to', null)],
	{
		occurrences: {
			'2026-11-25': {
				sources: [
					{ accountId: 'everyday', amount: 100_000 },
					{ accountId: 'ewallet', amount: 74_800 }
				]
			}
		}
	}
);
const music = plan('music', 'Music', { type: 'monthly', day: 12, start: '2026-10-12' }, [
	line('card', 'from', 15_000),
	line('food', 'to', 15_000)
]);
const repayment = plan('repay', 'Repayment from a friend', { type: 'once', date: '2026-11-14' }, [
	line('friend', 'from', 120_000),
	line('ewallet', 'to', 120_000)
]);
const lateRepayment = plan('late', 'Old repayment', { type: 'once', date: '2026-10-28' }, [
	line('friend', 'from', 200_000),
	line('everyday', 'to', 200_000)
]);
const insurance = plan(
	'ins',
	'Insurance',
	{ type: 'monthly', day: 5, start: '2026-12-05' },
	[line('everyday', 'from', 250_000), line('insurance', 'to', 250_000)],
	{ occurrences: { '2026-12-05': { sources: [{ accountId: 'reserve', amount: 250_000 }] } } }
);
const reserveTransfer = plan(
	'ealloc',
	'Reserve for Insurance',
	{ type: 'once', date: '2026-11-16' },
	[line('everyday', 'from', 250_000), line('reserve', 'to', 250_000)],
	{ allocates: { plan: 'scheduled', planId: 'ins', due: '2026-12-05' } }
);

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
	rows: ['2026-11-28', '2026-12-28', '2027-01-28', '2027-02-28', '2027-03-28'].map((due, i) => {
		const n = i + 1;
		return {
			n,
			due,
			date: due,
			principal: 130_000,
			interest: 0,
			additionals: [],
			...(n === 1
				? {
						sources: [
							{ accountId: 'everyday', amount: 80_000 },
							{ accountId: 'savings', amount: 50_000 }
						]
					}
				: {})
		};
	}),
	createdAt: now,
	updatedAt: now
};

const buffet = tx('buffet', '2026-11-09', [
	['food', 159_800],
	['card', -159_800]
]);
const loanPayment: Transaction = {
	...tx('loanpay', '2026-11-20', [
		['loan', 80_000],
		['everyday', -80_000]
	]),
	pays: { plan: 'installment', planId: 'gadget', due: '2026-11-28' }
};
const groceries = tx('groceries', '2026-11-17', [
	['food', 85_000],
	['everyday', -85_000]
]);

const forecasts: Forecast[] = [
	{
		id: '2026-11-15',
		fundingAccounts: ['payroll', 'everyday', 'reserve', 'savings'],
		createdAt: now,
		updatedAt: now
	}
];

function input(over: Partial<ForecastInput> = {}): ForecastInput {
	return {
		chart: buildChart(accounts, [buffet, loanPayment, groceries]),
		scheduled: [
			pay,
			move,
			internet,
			cardPay,
			music,
			repayment,
			lateRepayment,
			insurance,
			reserveTransfer
		],
		installments: [loan],
		forecasts,
		settings: null,
		today: '2026-11-20',
		...over
	};
}

describe('Cut-off windows', () => {
	it('cover the days since the previous Cut-off, the 30th running to month end', () => {
		expect(cutoffWindow('2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
		expect(cutoffWindow('2026-12-30')).toEqual({ from: '2026-12-16', to: '2026-12-31' });
		expect(cutoffWindow('2027-02-28')).toEqual({ from: '2027-02-16', to: '2027-02-28' });
	});

	it("fund the next window with this Cut-off's pay", () => {
		expect(fundedWindow('2026-11-15')).toEqual({ from: '2026-11-16', to: '2026-11-30' });
		expect(fundedWindow('2026-11-30')).toEqual({ from: '2026-12-01', to: '2026-12-15' });
		expect(fundingCutoffOf('2026-12-05')).toBe('2026-11-30');
		expect(fundingCutoffOf('2026-12-31')).toBe('2026-12-15');
		expect(fundingCutoffOf('2027-03-01')).toBe('2027-02-28');
	});

	it('step between Cut-offs across months and years', () => {
		expect(nextCutoff('2026-12-30')).toBe('2027-01-15');
		expect(previousCutoff('2027-01-15')).toBe('2026-12-30');
		expect(nextCutoff('2027-02-15')).toBe('2027-02-28');
		expect(previousCutoff('2027-03-15')).toBe('2027-02-28');
	});
});

describe('Funding Accounts', () => {
	it('come from the Cut-off document, else the latest earlier one', () => {
		expect(fundingAccountsFor(input(), '2026-11-15')).toEqual({
			ids: ['payroll', 'everyday', 'reserve', 'savings'],
			stored: true
		});
		expect(fundingAccountsFor(input(), '2026-11-30').stored).toBe(false);
		expect(fundingAccountsFor(input(), '2026-11-30').ids).toContain('reserve');
	});

	it("start from the plans' default Asset Accounts before any document exists", () => {
		const ids = fundingAccountsFor(input({ forecasts: [] }), '2026-11-15').ids;
		expect(ids).toEqual(expect.arrayContaining(['payroll', 'everyday']));
		expect(ids).not.toContain('friend');
		expect(ids).not.toContain('card');
	});

	it('save only Asset Leaf Accounts, and keep one still used as a source', () => {
		expect(() =>
			planSetFundingAccounts(input(), '2026-11-15', ['everyday', 'card'], now)
		).toThrow();
		expect(() =>
			planSetFundingAccounts(input(), '2026-11-15', ['payroll', 'reserve', 'savings'], now)
		).toThrow(/source/);
		expect(
			planSetFundingAccounts(
				input(),
				'2026-11-15',
				['payroll', 'everyday', 'reserve', 'savings', 'ewallet'],
				now
			)
		).toEqual([
			{
				op: 'setForecast',
				id: '2026-11-15',
				data: {
					fundingAccounts: ['payroll', 'everyday', 'reserve', 'savings', 'ewallet'],
					createdAt: now,
					updatedAt: now
				}
			}
		]);
	});
});

describe('A Forecast', () => {
	const f = buildForecast(input(), '2026-11-15');
	const out = (key: string) => f.outflows.find((o) => o.key === key)!;
	const lane = (id: string) => f.lanes.find((l) => l.accountId === id)!;

	it('counts Inflows in its own window by expected date, and a Late one from before', () => {
		expect(f.inflows.map((i) => [i.key, i.accountId, i.total, i.late])).toEqual([
			['scheduled:late:2026-10-28', 'everyday', 200_000, true],
			['scheduled:repay:2026-11-14', 'ewallet', 120_000, false],
			['scheduled:pay:2026-11-15', 'payroll', 2_000_000, false]
		]);
	});

	it('funds the Outflows due in the next window, plus Carried-over ones', () => {
		expect(f.outflows.map((o) => o.key).sort()).toEqual([
			'installment:gadget:2026-11-28',
			'scheduled:cardpay:2026-11-25',
			'scheduled:ealloc:2026-11-16',
			'scheduled:internet:2026-11-08',
			'scheduled:move:2026-11-16'
		]);
		expect(out('scheduled:internet:2026-11-08').carried).toBe('in');
	});

	it('puts a card payment in its Liability Section with its charges, recorded ones included', () => {
		const card = out('scheduled:cardpay:2026-11-25');
		expect(card.kind).toBe('liability');
		expect(card.section).toMatchObject({ kind: 'liability', name: 'Card X' });
		expect(card.charges!.map((c) => [c.label, c.amount])).toEqual([
			['buffet', 159_800],
			['Music', 15_000]
		]);
		expect(card.total).toBe(174_800);
	});

	it('marks a source on an Account outside the Funding Accounts as Unfunded', () => {
		const card = out('scheduled:cardpay:2026-11-25');
		expect(card.sources.map((s) => [s.accountId, s.amount, s.valid])).toEqual([
			['everyday', 100_000, true],
			['ewallet', 74_800, false]
		]);
		expect(card.unfunded).toBe(74_800);
	});

	it('derives paid per source from the paying Transactions', () => {
		const row = out('installment:gadget:2026-11-28');
		expect(row.label).toBe('[Ins 1/5] Gadget loan');
		expect(row.status).toBe('partly-paid');
		expect(row.sources.map((s) => [s.accountId, s.paid])).toEqual([
			['everyday', 80_000],
			['savings', 0]
		]);
	});

	it('groups Outflows into Sections: Overdue first, Others last', () => {
		expect(f.sections.map((s) => [s.section.name, s.outflows.map((o) => o.key)])).toEqual([
			['Overdue', ['scheduled:internet:2026-11-08']],
			['Internal Transfers', ['scheduled:move:2026-11-16', 'scheduled:ealloc:2026-11-16']],
			['Card X', ['scheduled:cardpay:2026-11-25']],
			['Others', ['installment:gadget:2026-11-28']]
		]);
	});

	it("works out each Funding Account's figures", () => {
		expect(lane('payroll')).toMatchObject({
			inn: 2_000_000,
			forecastedExp: 1_500_000,
			plannedLeft: 500_000
		});
		expect(lane('everyday')).toMatchObject({
			transferIn: 1_500_000,
			inn: 1_700_000,
			forecastedExp: 580_000,
			plannedLeft: 1_120_000,
			received: 0,
			paid: 165_000,
			left: -165_000,
			forecastedEAlloc: 250_000,
			eAlloc: 0
		});
		expect(lane('everyday').unplanned.map((u) => [u.txId, u.amount])).toEqual([
			['groceries', 85_000]
		]);
		expect(lane('reserve')).toMatchObject({ inn: 0, plannedLeft: 0 });
		expect(lane('savings').plannedLeft).toBe(-50_000);
		expect(lane('ewallet')).toMatchObject({ funding: false, inn: 120_000 });
	});

	it('totals Unfunded and Short, and warns without blocking', () => {
		expect(f.totals.unfunded).toBe(74_800);
		expect(f.totals.short).toBe(-50_000);
	});
});

describe('Early allocation', () => {
	it('marks the transfer E.Alloc and its target "Allocated in" the earlier Cut-off', () => {
		const a = buildForecast(input(), '2026-11-15');
		expect(a.outflows.find((o) => o.key === 'scheduled:ealloc:2026-11-16')!.ealloc).toEqual({
			plan: 'scheduled',
			planId: 'ins',
			due: '2026-12-05'
		});
		const b = buildForecast(input(), '2026-11-30');
		const target = b.outflows.find((o) => o.key === 'scheduled:ins:2026-12-05')!;
		expect(target.allocatedIn).toBe('2026-11-15');
		expect(target.sources).toEqual([
			{ accountId: 'reserve', amount: 250_000, paid: 0, valid: true }
		]);
		expect(b.lanes.find((l) => l.accountId === 'reserve')).toMatchObject({
			allocatedFor: 250_000,
			inn: 250_000,
			plannedLeft: 0,
			// Not in the reserve yet: the transfer isn't recorded.
			received: 0
		});
	});
});

describe('Carry-over', () => {
	it('greys an unpaid Outflow in its own Forecast once its window has ended', () => {
		const old = buildForecast(input(), '2026-10-30');
		const net = old.outflows.find((o) => o.key === 'scheduled:internet:2026-11-08')!;
		expect(net.carried).toBe('2026-11-15');
		expect(old.totals.outflows).toBe(0);
	});
});

describe('Bill with next payment', () => {
	it('moves a recorded charge to the following card payment', () => {
		const later = { ...buffet, billOn: '2026-11-26' };
		const chart = buildChart(accounts, [later, loanPayment, groceries]);
		const f = buildForecast(input({ chart }), '2026-11-15');
		const card = f.outflows.find((o) => o.key === 'scheduled:cardpay:2026-11-25')!;
		expect(card.charges!.map((c) => c.label)).toEqual(['Music']);
		expect(card.total).toBe(15_000);
	});
});

describe('Sections', () => {
	it("use the owner's Section on a plan, falling back when it's deleted", () => {
		const scheduled = input().scheduled.map((p) =>
			p.id === 'move' ? { ...p, section: 'important' } : p
		);
		const f = buildForecast(input({ scheduled }), '2026-11-15');
		expect(f.outflows.find((o) => o.key === 'scheduled:move:2026-11-16')!.section.name).toBe(
			'Important'
		);
		const settings = {
			...DEFAULT_FORECAST_SECTIONS,
			outflowSections: DEFAULT_FORECAST_SECTIONS.outflowSections.filter(
				(s) => s.id !== 'important'
			),
			updatedAt: now
		};
		const g = buildForecast(input({ scheduled, settings }), '2026-11-15');
		expect(g.outflows.find((o) => o.key === 'scheduled:move:2026-11-16')!.section.name).toBe(
			'Internal Transfers'
		);
	});

	it('derive Inflow Sections from where the money comes from', () => {
		const f = buildForecast(input(), '2026-11-15');
		expect(f.inflows.map((i) => i.section.name)).toEqual(['Repayments', 'Repayments', 'Pay']);
	});
});

describe('Accounts a Forecast uses', () => {
	it('are reported so they cannot be deleted', () => {
		const users = forecastAccountUsers(input());
		const used = new Set(users.flatMap((u) => Object.values(u.accounts)));
		expect(used).toContain('reserve');
		expect(used).toContain('ewallet');
		expect(used).toContain('savings');
	});
});
