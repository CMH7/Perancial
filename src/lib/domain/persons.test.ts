import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import {
	linkedPerson,
	netPosition,
	planArchivePerson,
	planDeletePerson,
	planFillFromLinks,
	planSavePerson,
	prefillPersons
} from './persons.ts';
import type { Person, Scheduled } from './schemas.ts';
import { account, now, opening, roots, tx } from './test-fixtures.ts';

// Made-up figures in centavos; made-up Persons.
const chart = buildChart(
	[
		...roots,
		account('bank', 'asset', 'asset'),
		account('owed-by-partner', 'asset', 'asset', { personId: 'partner' }),
		account('payables', 'liability', 'liability', { personId: 'parent' }),
		account('payables-15th', 'liability', 'payables'),
		account('payables-eom', 'liability', 'payables', { personId: 'sibling' }),
		account('owe-partner', 'liability', 'liability', { personId: 'partner' }),
		account('food', 'expense', 'expense')
	],
	[
		opening('bank', 1000000),
		opening('owed-by-partner', 300000),
		opening('owe-partner', -50000),
		opening('payables-15th', -20000),
		tx('lend', '2026-11-03', [
			['owed-by-partner', 100000],
			['bank', -100000]
		])
	]
);

describe('linkedPerson', () => {
	it('is the Account’s own link, else its nearest Group’s', () => {
		expect(linkedPerson(chart, 'owed-by-partner')).toBe('partner');
		expect(linkedPerson(chart, 'payables-15th')).toBe('parent');
		expect(linkedPerson(chart, 'payables-eom')).toBe('sibling');
		expect(linkedPerson(chart, 'bank')).toBeNull();
	});
});

describe('prefillPersons', () => {
	it('adds each linked Account’s Person to the list on its own side', () => {
		expect(prefillPersons(chart, { from: ['bank'], to: ['owed-by-partner'] })).toEqual({
			from: [],
			to: ['partner']
		});
		expect(
			prefillPersons(chart, { from: ['owed-by-partner', 'payables-15th'], to: ['bank'] })
		).toEqual({ from: ['partner', 'parent'], to: [] });
	});

	it('keeps Persons already picked, without repeating them', () => {
		expect(
			prefillPersons(
				chart,
				{ from: ['bank'], to: ['owed-by-partner'] },
				{ from: ['me'], to: ['partner'] }
			)
		).toEqual({ from: ['me'], to: ['partner'] });
	});
});

describe('netPosition', () => {
	it('is what they owe the owner minus what the owner owes them', () => {
		// Owed 3,000 + 1,000 lent; owed to them 500.
		expect(netPosition(chart, 'partner')).toEqual({ owesYou: 400000, youOwe: 50000, net: 350000 });
		// The Group's link covers the 15th child; the EoM child has its own Person.
		expect(netPosition(chart, 'parent')).toEqual({ owesYou: 0, youOwe: 20000, net: -20000 });
	});
});

describe('Saving Persons', () => {
	const partner: Person = {
		id: 'partner',
		name: 'Partner',
		archived: false,
		createdAt: now,
		updatedAt: now
	};
	const later = new Date('2026-11-20T00:00:00Z');

	it('creates a Person, and renames one keeping its creation time', () => {
		expect(planSavePerson([], { id: 'p1', name: '  Friend ' }, { now: later })).toEqual([
			{
				op: 'setPerson',
				id: 'p1',
				data: { name: 'Friend', archived: false, createdAt: later, updatedAt: later }
			}
		]);
		expect(planSavePerson([partner], { id: 'partner', name: 'Fiancé' }, { now: later })).toEqual([
			{
				op: 'setPerson',
				id: 'partner',
				data: { name: 'Fiancé', archived: false, createdAt: now, updatedAt: later }
			}
		]);
	});

	it('never renames, archives or deletes Me', () => {
		expect(() => planSavePerson([], { id: 'me', name: 'Myself' }, { now })).toThrow(/Me/);
		expect(() => planArchivePerson([], 'me', true, { now })).toThrow(/Me/);
		expect(() => planDeletePerson({ chart, scheduled: [] }, 'me')).toThrow(/Me/);
	});

	it('archives and unarchives', () => {
		expect(planArchivePerson([partner], 'partner', true, { now: later })[0]).toMatchObject({
			data: { archived: true, updatedAt: later }
		});
	});

	it('deletes a Person nothing names, and refuses one an Account, Transaction or plan names', () => {
		expect(planDeletePerson({ chart, scheduled: [] }, 'nobody')).toEqual([
			{ op: 'deletePerson', id: 'nobody' }
		]);
		expect(() => planDeletePerson({ chart, scheduled: [] }, 'partner')).toThrow(/archive/i);
		const named = buildChart(chart.all(), [
			{
				...tx('gift', '2026-11-04', [
					['food', 100],
					['bank', -100]
				]),
				toPersons: ['friend']
			}
		]);
		expect(() => planDeletePerson({ chart: named, scheduled: [] }, 'friend')).toThrow(/archive/i);
		const plan = {
			id: 'allowance',
			versions: [
				{
					from: '2026-11-01',
					description: 'Allowance',
					note: '',
					tags: [],
					lines: [],
					rule: { type: 'once', date: '2026-11-01' },
					toPersons: ['cousin']
				}
			],
			end: { type: 'never' },
			occurrences: {},
			createdAt: now,
			updatedAt: now
		} as unknown as Scheduled;
		expect(() => planDeletePerson({ chart, scheduled: [plan] }, 'cousin')).toThrow(/archive/i);
	});
});

describe('planFillFromLinks', () => {
	it('adds the Person to past Transactions on linked Accounts, only where that side is blank', () => {
		const later = new Date('2026-11-20T00:00:00Z');
		const repaid = tx('repaid', '2026-11-08', [
			['bank', 50000],
			['owed-by-partner', -50000]
		]);
		const tagged = {
			...tx('tagged', '2026-11-09', [
				['owed-by-partner', 100],
				['bank', -100]
			]),
			toPersons: ['me']
		};
		const filled = buildChart(chart.all(), [...chart.transactions(), repaid, tagged]);
		const writes = planFillFromLinks(filled, 'partner', { now: later });
		expect(
			writes.map((w) => [w.id, w.op === 'setTransaction' && [w.data.fromPersons, w.data.toPersons]])
		).toEqual([
			['lend', [[], ['partner']]],
			['repaid', [['partner'], []]]
		]);
		expect(writes[0]).toMatchObject({ data: { updatedAt: later } });
	});
});
