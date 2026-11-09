import { describe, expect, it, vi } from 'vitest';
import { buildChart } from './chart.ts';
import type { Account, AccountType, Transaction } from './schemas.ts';

const now = new Date('2026-11-09T00:00:00Z');

function account(
	id: string,
	type: AccountType,
	parentId: string | null,
	extra: Partial<Account> = {}
): Account {
	return {
		id,
		name: id,
		description: '',
		type,
		parentId,
		system: parentId === null ? 'root' : null,
		archived: false,
		order: 0,
		createdAt: now,
		updatedAt: now,
		...extra
	};
}

const roots = [
	account('asset', 'asset', null),
	account('liability', 'liability', null),
	account('equity', 'equity', null),
	account('income', 'income', null),
	account('expense', 'expense', null),
	account('opening-balances', 'equity', 'equity', { system: 'opening-balances' })
];

/** Opening Balance in storage sign (Asset positive, Liability negative), against Opening Balances. */
function opening(accountId: string, amount: number): Transaction {
	return {
		id: `opening_${accountId}`,
		date: null,
		kind: 'opening',
		description: 'Opening Balance',
		entries: [
			{ accountId, amount },
			{ accountId: 'opening-balances', amount: -amount }
		],
		accountIds: [accountId, 'opening-balances'],
		createdAt: now,
		updatedAt: now
	};
}

function tx(id: string, date: string, entries: [string, number][]): Transaction {
	return {
		id,
		date,
		kind: 'normal',
		description: id,
		entries: entries.map(([accountId, amount]) => ({ accountId, amount })),
		accountIds: entries.map(([accountId]) => accountId),
		createdAt: now,
		updatedAt: now
	};
}

describe('balance as of a date', () => {
	const accounts = [
		...roots,
		account('cash', 'asset', 'asset'),
		account('food', 'expense', 'expense'),
		account('rent', 'expense', 'expense')
	];
	const transactions = [
		opening('cash', 500000),
		tx('lunch', '2026-11-03', [
			['food', 20000],
			['cash', -20000]
		]),
		tx('rent', '2026-12-01', [
			['rent', 100000],
			['cash', -100000]
		])
	];
	const chart = buildChart(accounts, transactions);

	it('counts Entries dated on or before the date, including backdated ones', () => {
		expect(chart.balance('cash', '2026-11-09')).toBe(480000);
		expect(chart.balance('cash', '2026-11-03')).toBe(480000);
		expect(chart.balance('food', '2026-11-03')).toBe(20000);
	});

	it('does not count Entries dated later yet', () => {
		expect(chart.balance('rent', '2026-11-30')).toBe(0);
		expect(chart.balance('cash', '2026-12-01')).toBe(380000);
	});

	it('counts the Opening Balance on any date, even before the first Transaction', () => {
		expect(chart.balance('cash', '2020-01-01')).toBe(500000);
	});

	it('defaults to today', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 10, 15, 12));
		try {
			expect(chart.balance('cash')).toBe(480000);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('tree', () => {
	const chart = buildChart(
		[
			...roots,
			account('gcash', 'asset', 'asset', { order: 2 }),
			account('maribank', 'asset', 'asset', { order: 0 }),
			account('old-bank', 'asset', 'asset', { order: 3, archived: true }),
			account('cash', 'asset', 'asset', { order: 1 }),
			account('savings', 'asset', 'maribank'),
			account('goals', 'asset', 'maribank', { order: 1 }),
			account('travel', 'asset', 'goals')
		],
		[]
	);
	const ids = (list: Account[]) => list.map((a) => a.id);

	it('lists children in manual order, hiding Archived Accounts unless asked', () => {
		expect(ids(chart.children('asset'))).toEqual(['maribank', 'cash', 'gcash']);
		expect(ids(chart.children('asset', { showArchived: true }))).toEqual([
			'maribank',
			'cash',
			'gcash',
			'old-bank'
		]);
	});

	it('gives the path from the Root Account down to an Account', () => {
		expect(ids(chart.path('travel'))).toEqual(['asset', 'maribank', 'goals', 'travel']);
		expect(ids(chart.path('asset'))).toEqual(['asset']);
	});

	it('treats an Account with children as a Group, and Root Accounts always as Groups', () => {
		expect(chart.isGroup('maribank')).toBe(true);
		expect(chart.isGroup('cash')).toBe(false);
		expect(chart.isGroup('expense')).toBe(true);
	});

	it('counts every Account inside a Group', () => {
		expect(chart.descendantCount('maribank')).toBe(3);
		expect(chart.descendantCount('cash')).toBe(0);
	});
});

describe('before the System Accounts have loaded', () => {
	it('treats unknown Accounts as empty instead of failing', () => {
		const chart = buildChart([account('cash', 'asset', 'asset')], [opening('cash', 345000)]);
		expect(chart.balance('missing')).toBe(0);
		expect(chart.totals()).toEqual({ assets: 345000, liabilities: 0, netWorth: 345000 });
		expect(chart.path('missing')).toEqual([]);
		expect(chart.isGroup('missing')).toBe(false);
	});
});

describe('totals', () => {
	it('gives Total Assets, Total Liabilities, and Net Worth, counting Abnormal Balances', () => {
		const chart = buildChart(
			[
				...roots,
				account('cash', 'asset', 'asset'),
				account('bpi', 'asset', 'asset'),
				account('ploan', 'liability', 'liability'),
				account('metro-card', 'liability', 'liability')
			],
			[
				opening('cash', 345000),
				opening('bpi', -50000), // overdrawn
				opening('ploan', -3000000),
				opening('metro-card', 120000) // overpaid card
			]
		);
		expect(chart.balance('bpi')).toBe(-50000);
		expect(chart.balance('metro-card')).toBe(-120000);
		expect(chart.totals()).toEqual({
			assets: 295000,
			liabilities: 2880000,
			netWorth: -2585000
		});
	});
});

describe('balance', () => {
	it('shows a Leaf Asset Account its Opening Balance', () => {
		const chart = buildChart(
			[...roots, account('cash', 'asset', 'asset')],
			[opening('cash', 500000)]
		);
		expect(chart.balance('cash')).toBe(500000);
	});

	it('shows a Liability as the positive amount owed', () => {
		const chart = buildChart(
			[...roots, account('ploan', 'liability', 'liability')],
			[opening('ploan', -3000000)]
		);
		expect(chart.balance('ploan')).toBe(3000000);
	});

	it('sums nested children into each Group Account', () => {
		const chart = buildChart(
			[
				...roots,
				account('maribank', 'asset', 'asset'),
				account('savings', 'asset', 'maribank'),
				account('goals', 'asset', 'maribank'),
				account('emergency', 'asset', 'goals'),
				account('travel', 'asset', 'goals'),
				account('cash', 'asset', 'asset')
			],
			[
				opening('savings', 4500000),
				opening('emergency', 2000000),
				opening('travel', 850000),
				opening('cash', 345000)
			]
		);
		expect(chart.balance('goals')).toBe(2850000);
		expect(chart.balance('maribank')).toBe(7350000);
		expect(chart.balance('asset')).toBe(7695000);
	});
});
