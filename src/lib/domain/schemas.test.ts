import { describe, expect, it } from 'vitest';
import { parseAccount, parseTransaction } from './schemas.ts';

const now = new Date('2026-11-09T00:00:00Z');

const lunch = {
	date: '2026-11-03',
	kind: 'normal',
	description: 'Lunch',
	entries: [
		{ accountId: 'food', amount: 20000 },
		{ accountId: 'cash', amount: -20000 }
	],
	accountIds: ['food', 'cash'],
	createdAt: now,
	updatedAt: now
};

describe('parseTransaction', () => {
	it('parses a balanced two-Entry Transaction and attaches its id', () => {
		expect(parseTransaction('tx1', lunch)).toEqual({ id: 'tx1', ...lunch });
	});

	it('rejects a Transaction whose Entries do not add up to zero', () => {
		const lopsided = {
			...lunch,
			entries: [
				{ accountId: 'food', amount: 20000 },
				{ accountId: 'cash', amount: -15000 }
			]
		};
		expect(() => parseTransaction('tx1', lopsided)).toThrow(/add up to zero/);
	});

	it('rejects a Transaction with fewer than two Entries', () => {
		const single = { ...lunch, entries: [{ accountId: 'cash', amount: 0 }], accountIds: ['cash'] };
		expect(() => parseTransaction('tx1', single)).toThrow(/at least two Entries/);
	});

	it('rejects amounts that are not whole centavos', () => {
		const fractional = {
			...lunch,
			entries: [
				{ accountId: 'food', amount: 199.5 },
				{ accountId: 'cash', amount: -199.5 }
			]
		};
		expect(() => parseTransaction('tx1', fractional)).toThrow(/integer/i);
	});

	it('requires a YYYY-MM-DD date on a normal Transaction', () => {
		expect(() => parseTransaction('tx1', { ...lunch, date: null })).toThrow(/date/);
		expect(() => parseTransaction('tx1', { ...lunch, date: '11/03/2026' })).toThrow(/date/);
		expect(() => parseTransaction('tx1', { ...lunch, date: '2026-02-30' })).toThrow(/date/);
	});

	it('requires a null date on an Opening Balance Transaction', () => {
		const opening = {
			...lunch,
			kind: 'opening',
			description: 'Opening Balance',
			entries: [
				{ accountId: 'cash', amount: 500000 },
				{ accountId: 'opening-balances', amount: -500000 }
			],
			accountIds: ['cash', 'opening-balances']
		};
		expect(parseTransaction('opening_cash', { ...opening, date: null }).date).toBeNull();
		expect(() => parseTransaction('opening_cash', opening)).toThrow(/date/);
	});
});

describe('parseAccount', () => {
	it('parses a valid Leaf Account document and attaches its id', () => {
		const account = parseAccount('gcash', {
			name: 'GCash',
			description: 'E-wallet',
			type: 'asset',
			parentId: 'asset',
			system: null,
			archived: false,
			order: 2,
			createdAt: now,
			updatedAt: now
		});

		expect(account).toEqual({
			id: 'gcash',
			name: 'GCash',
			description: 'E-wallet',
			type: 'asset',
			parentId: 'asset',
			system: null,
			archived: false,
			order: 2,
			createdAt: now,
			updatedAt: now
		});
	});
});
