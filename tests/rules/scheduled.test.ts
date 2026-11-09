import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { scheduledPath } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();
const ref = (db: Firestore, id: string) => doc(db, scheduledPath(OWNER_UID), id);
const now = new Date();
const rent = {
	versions: [
		{
			from: '2026-01-05',
			description: 'Rent',
			note: '',
			tags: [],
			lines: [
				{ accountId: 'bpi', side: 'from', amount: null },
				{ accountId: 'rent', side: 'to', amount: 1200000 }
			],
			rule: { type: 'monthly', day: 5, start: '2026-01-05' }
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now
};

describe('Scheduled Transactions', () => {
	it('let the owner write and read a plan', async () => {
		const db = ownerDb(env());
		await assertSucceeds(setDoc(ref(db, 'p1'), rent));
		await assertSucceeds(getDoc(ref(db, 'p1')));
	});

	it('keep everyone else out', async () => {
		const stranger = env().authenticatedContext('stranger-uid').firestore() as unknown as Firestore;
		await assertFails(setDoc(ref(stranger, 'p1'), rent));
		await assertFails(getDoc(ref(stranger, 'p1')));
	});

	it('reject missing, extra or wrongly typed top-level fields', async () => {
		const db = ownerDb(env());
		const { end: _end, ...noEnd } = rent;
		await assertFails(setDoc(ref(db, 'p1'), noEnd));
		await assertFails(setDoc(ref(db, 'p1'), { ...rent, paid: true }));
		await assertFails(setDoc(ref(db, 'p1'), { ...rent, versions: [] }));
		await assertFails(setDoc(ref(db, 'p1'), { ...rent, versions: 'monthly' }));
		await assertFails(setDoc(ref(db, 'p1'), { ...rent, end: 'never' }));
		await assertFails(setDoc(ref(db, 'p1'), { ...rent, occurrences: [] }));
	});
});
