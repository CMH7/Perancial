import { describe, expect, it } from 'vitest';
import { parseAccount, parseInstallment, parseScheduled, parseTransaction } from './schemas.ts';

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

describe('parseScheduled', () => {
	const rent = {
		versions: [
			{
				from: '2026-01-05',
				description: 'Rent',
				note: '',
				tags: ['house'],
				lines: [
					{ accountId: 'bpi', side: 'from', amount: null },
					{ accountId: 'rent', side: 'to', amount: 1200000 },
					{ accountId: 'bank-fees', side: 'to', amount: 1500, fee: 'additional' }
				],
				rule: { type: 'monthly', day: 5, start: '2026-01-05' }
			}
		],
		end: { type: 'never' },
		createdAt: now,
		updatedAt: now
	};

	it('parses a plan, filling an empty map of occurrence changes', () => {
		expect(parseScheduled('p1', rent)).toEqual({ id: 'p1', ...rent, occurrences: {} });
	});

	it('accepts every rule type and end, and changes to single occurrences', () => {
		const rules = [
			{ type: 'once', date: '2026-12-01' },
			{ type: 'cutoff', start: '2026-01-15' },
			{ type: 'weekly', every: 2, start: '2026-01-02' },
			{ type: 'yearly', start: '2026-03-01' }
		];
		for (const rule of rules) {
			const plan = { ...rent, versions: [{ ...rent.versions[0], rule }] };
			expect(parseScheduled('p1', plan).versions[0].rule).toEqual(rule);
		}
		const changed = parseScheduled('p1', {
			...rent,
			end: { type: 'after', count: 12 },
			occurrences: {
				'2026-02-05': { skipped: true },
				'2026-03-05': { movedTo: '2026-03-07', amounts: [null, 1300000, 1500], settled: true }
			}
		});
		expect(changed.end).toEqual({ type: 'after', count: 12 });
		expect(changed.occurrences['2026-03-05'].movedTo).toBe('2026-03-07');
	});

	it('needs a line on each side, positive amounts, fees only on To, and versions in date order', () => {
		const lines = (l: object[]) => () =>
			parseScheduled('p1', { ...rent, versions: [{ ...rent.versions[0], lines: l }] });
		expect(lines([{ accountId: 'rent', side: 'to', amount: 100 }])).toThrow(/each side/);
		expect(
			lines([
				{ accountId: 'bpi', side: 'from', amount: -100 },
				{ accountId: 'rent', side: 'to', amount: 100 }
			])
		).toThrow();
		expect(
			lines([
				{ accountId: 'bpi', side: 'from', amount: 100, fee: 'less' },
				{ accountId: 'rent', side: 'to', amount: 100 }
			])
		).toThrow(/fee/i);
		const v = rent.versions[0];
		expect(() =>
			parseScheduled('p1', { ...rent, versions: [{ ...v, from: '2026-06-05' }, v] })
		).toThrow(/order/);
		expect(() => parseScheduled('p1', { ...rent, versions: [] })).toThrow();
		expect(() =>
			parseScheduled('p1', {
				...rent,
				versions: [{ ...v, rule: { type: 'monthly', day: 32, start: '2026-01-05' } }]
			})
		).toThrow();
	});
});

describe('parseInstallment', () => {
	const visa = {
		kind: 'lender',
		title: 'ANV15 VISA',
		note: '',
		tags: ['anv15-rcbc-visa'],
		purchaseDate: '2026-08-24',
		entry: 'flat',
		rule: { type: 'monthly', day: 15, start: '2026-11-15' },
		trackedFrom: 1,
		accounts: { repaid: 'anv15', paying: 'visa-spending', interest: 'finance', fees: 'finance' },
		rows: [
			{
				n: 1,
				due: '2026-11-15',
				date: '2026-11-15',
				principal: 233333,
				interest: 0,
				additionals: []
			},
			{
				n: 2,
				due: '2026-12-15',
				date: '2026-12-15',
				principal: 233337,
				interest: 0,
				additionals: [{ description: 'Late fee', amount: 50000 }],
				settled: true
			}
		],
		createdAt: now,
		updatedAt: now
	};

	it('parses a plan and attaches its id', () => {
		expect(parseInstallment('p1', visa)).toMatchObject({ id: 'p1', ...visa });
	});

	it('allows internal plans without Interest and Fees Accounts', () => {
		const internal = {
			...visa,
			kind: 'internal',
			accounts: { repaid: 'loan-money', paying: 'bpi', interest: null, fees: null }
		};
		expect(parseInstallment('p1', internal).accounts.interest).toBeNull();
	});

	it('rejects bad kinds, empty titles, empty rows and bad row amounts or dates', () => {
		const bad = (patch: object) => () => parseInstallment('p1', { ...visa, ...patch });
		expect(bad({ kind: 'loan' })).toThrow();
		expect(bad({ rows: [] })).toThrow();
		expect(bad({ title: '' })).toThrow();
		expect(bad({ rows: [{ ...visa.rows[0], principal: -1 }] })).toThrow();
		expect(bad({ rows: [{ ...visa.rows[0], principal: 1.5 }] })).toThrow();
		expect(
			bad({ rows: [{ ...visa.rows[0], additionals: [{ description: 'x', amount: 0 }] }] })
		).toThrow();
		expect(bad({ rows: [{ ...visa.rows[0], due: '15 Nov' }] })).toThrow();
	});
});
