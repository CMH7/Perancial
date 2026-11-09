import { describe, expect, it } from 'vitest';
import { parseAccount, parseTransaction } from './schemas.ts';

const now = new Date('2026-11-09T00:00:00Z');

const lunch = {
	date: '2026-11-03',
	origin: 'normal',
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
		expect(parseTransaction('tx1', lunch)).toMatchObject({ id: 'tx1', ...lunch });
	});

	it('fills defaults for fields older documents lack', () => {
		expect(parseTransaction('tx1', lunch)).toMatchObject({
			note: '',
			status: 'cleared',
			tags: [],
			pays: null
		});
	});

	it('reads a legacy kind field as origin', () => {
		const { origin, ...rest } = lunch;
		const parsed = parseTransaction('tx1', { ...rest, kind: origin });
		expect(parsed.origin).toBe('normal');
		expect(parsed).not.toHaveProperty('kind');
	});

	it('keeps a pending status, tags, a fee line and a paid link', () => {
		const rent = {
			...lunch,
			status: 'pending',
			tags: ['house', 'q4-2026'],
			entries: [
				{ accountId: 'rent', amount: 1200000 },
				{ accountId: 'bank-fees', amount: 1500, fee: 'additional' },
				{ accountId: 'bpi', amount: -1201500 }
			],
			pays: { plan: 'scheduled', planId: 'p1', due: '2026-12-05' }
		};
		expect(parseTransaction('tx1', rent)).toMatchObject(rent);
	});

	it('rejects malformed status, tags, fee and paid link', () => {
		const bad = (patch: object) => () => parseTransaction('tx1', { ...lunch, ...patch });
		expect(bad({ status: 'posted' })).toThrow();
		expect(bad({ tags: ['House'] })).toThrow(/lowercase/);
		expect(bad({ tags: ['baguio 2026'] })).toThrow(/lowercase/);
		expect(bad({ tags: ['trip', 'trip'] })).toThrow(/repeat/);
		expect(bad({ tags: Array.from({ length: 51 }, (_, i) => `t${i}`) })).toThrow(/50/);
		expect(bad({ entries: [{ ...lunch.entries[0], fee: 'extra' }, lunch.entries[1]] })).toThrow();
		expect(bad({ pays: { plan: 'loan', planId: 'p1', due: '2026-12-05' } })).toThrow();
		expect(bad({ pays: { plan: 'scheduled', planId: 'p1', due: '5 Dec' } })).toThrow();
	});

	it('limits Description, Note and the number of Entries', () => {
		const bad = (patch: object) => () => parseTransaction('tx1', { ...lunch, ...patch });
		expect(bad({ description: 'x'.repeat(201) })).toThrow(/200/);
		expect(bad({ note: 'x'.repeat(5001) })).toThrow(/5,000/);
		const many = Array.from({ length: 101 }, (_, i) => ({
			accountId: `a${i}`,
			amount: i === 0 ? -100 : 1
		}));
		expect(bad({ entries: many })).toThrow(/100/);
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
			origin: 'opening',
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
