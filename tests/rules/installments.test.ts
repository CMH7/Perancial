import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { installmentsPath } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();
const ref = (db: Firestore, id: string) => doc(db, installmentsPath(OWNER_UID), id);
const now = new Date();
const visa = {
	kind: 'lender',
	title: 'ANV15 VISA',
	note: '',
	tags: [],
	purchaseDate: '2026-08-24',
	entry: 'flat',
	rule: { type: 'monthly', day: 15, start: '2026-11-15' },
	trackedFrom: 1,
	accounts: { repaid: 'anv15', paying: 'visa', interest: 'finance', fees: 'finance' },
	rows: [
		{ n: 1, due: '2026-11-15', date: '2026-11-15', principal: 233333, interest: 0, additionals: [] }
	],
	createdAt: now,
	updatedAt: now
};

describe('Installment Plans', () => {
	it('let the owner write and read a plan', async () => {
		const db = ownerDb(env());
		await assertSucceeds(setDoc(ref(db, 'p1'), visa));
		await assertSucceeds(getDoc(ref(db, 'p1')));
	});

	it('keep everyone else out', async () => {
		const stranger = env().authenticatedContext('stranger-uid').firestore() as unknown as Firestore;
		await assertFails(setDoc(ref(stranger, 'p1'), visa));
		await assertFails(getDoc(ref(stranger, 'p1')));
	});

	it('reject missing, extra or wrongly typed top-level fields', async () => {
		const db = ownerDb(env());
		const { rule: _rule, ...noRule } = visa;
		await assertFails(setDoc(ref(db, 'p1'), noRule));
		await assertFails(setDoc(ref(db, 'p1'), { ...visa, balance: 0 }));
		await assertFails(setDoc(ref(db, 'p1'), { ...visa, kind: 'loan' }));
		await assertFails(setDoc(ref(db, 'p1'), { ...visa, title: '' }));
		await assertFails(setDoc(ref(db, 'p1'), { ...visa, rows: [] }));
		await assertFails(setDoc(ref(db, 'p1'), { ...visa, accounts: 'anv15' }));
		await assertFails(setDoc(ref(db, 'p1'), { ...visa, trackedFrom: '1' }));
	});
});
