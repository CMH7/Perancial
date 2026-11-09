import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { transactionsPath } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();
const ref = (id: string) => doc(ownerDb(env()), transactionsPath(OWNER_UID), id);
const now = new Date();
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
const full = {
	...lunch,
	note: 'With Ana',
	status: 'pending',
	tags: ['birthday', 'q4-2026'],
	entries: [
		{ accountId: 'food', amount: 20000 },
		{ accountId: 'bank-fees', amount: 1500, fee: 'additional' },
		{ accountId: 'cash', amount: -21500 }
	],
	accountIds: ['food', 'bank-fees', 'cash'],
	pays: { plan: 'scheduled', planId: 'p1', due: '2026-12-05' }
};

describe('Transactions', () => {
	it('accept a full v2 Transaction, and one without the newer optional fields', async () => {
		await assertSucceeds(setDoc(ref('tx1'), full));
		await assertSucceeds(setDoc(ref('tx2'), lunch));
		await assertSucceeds(setDoc(ref('tx3'), { ...full, pays: null, note: '', tags: [] }));
	});

	it('reject fewer than two or more than 100 Entries', async () => {
		await assertFails(setDoc(ref('tx1'), { ...lunch, entries: [lunch.entries[0]] }));
		const many = Array.from({ length: 101 }, (_, i) => ({ accountId: `a${i}`, amount: 0 }));
		await assertFails(setDoc(ref('tx1'), { ...lunch, entries: many }));
	});

	it('reject the legacy kind field, unknown origins and statuses, and extra fields', async () => {
		await assertFails(setDoc(ref('tx1'), { ...lunch, kind: 'normal' }));
		await assertFails(setDoc(ref('tx1'), { ...lunch, origin: 'transfer' }));
		await assertFails(setDoc(ref('tx1'), { ...full, status: 'posted' }));
		await assertFails(setDoc(ref('tx1'), { ...lunch, balance: 1 }));
	});

	it('reject bad tags', async () => {
		await assertFails(setDoc(ref('tx1'), { ...full, tags: ['Birthday'] }));
		await assertFails(setDoc(ref('tx1'), { ...full, tags: ['baguio 2026'] }));
		await assertFails(setDoc(ref('tx1'), { ...full, tags: 'birthday' }));
		const tooMany = Array.from({ length: 51 }, (_, i) => `t${i}`);
		await assertFails(setDoc(ref('tx1'), { ...full, tags: tooMany }));
	});

	it('reject an empty or too long Description, a too long Note, and a malformed paid link', async () => {
		await assertFails(setDoc(ref('tx1'), { ...lunch, description: '' }));
		await assertFails(setDoc(ref('tx1'), { ...lunch, description: 'x'.repeat(201) }));
		await assertFails(setDoc(ref('tx1'), { ...full, note: 'x'.repeat(5001) }));
		await assertFails(setDoc(ref('tx1'), { ...full, pays: 'p1' }));
	});
});
