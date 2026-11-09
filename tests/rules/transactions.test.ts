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

describe('Transactions', () => {
	it('accept a well-formed Transaction', async () => {
		await assertSucceeds(setDoc(ref('tx1'), lunch));
	});

	it('reject fewer than two Entries, unknown kinds, and extra fields', async () => {
		await assertFails(setDoc(ref('tx1'), { ...lunch, entries: [lunch.entries[0]] }));
		await assertFails(setDoc(ref('tx1'), { ...lunch, kind: 'transfer' }));
		await assertFails(setDoc(ref('tx1'), { ...lunch, balance: 1 }));
	});
});
