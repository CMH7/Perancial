import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { statementsPath } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();
const now = new Date();
const stranger = () =>
	env().authenticatedContext('stranger-uid').firestore() as unknown as Firestore;

// Made-up figures in centavos.
const statement = {
	amount: 1250000,
	sources: [{ accountId: 'everyday', amount: 1250000 }],
	createdAt: now,
	updatedAt: now
};
const ref = (db: Firestore, id: string) => doc(db, statementsPath(OWNER_UID), id);

describe('Credit Card Statements', () => {
	it('let the owner write and read an entered amount and Paying sources', async () => {
		const db = ownerDb(env());
		await assertSucceeds(setDoc(ref(db, 'visa_2026-11-20'), statement));
		await assertSucceeds(setDoc(ref(db, 'visa_2026-12-20'), { ...statement, amount: null }));
		await assertSucceeds(getDoc(ref(db, 'visa_2026-11-20')));
	});

	it('keep everyone else out', async () => {
		await assertFails(setDoc(ref(stranger(), 'visa_2026-11-20'), statement));
		await assertFails(getDoc(ref(stranger(), 'visa_2026-11-20')));
	});

	it('reject an id without a Statement Date, extra or missing keys and wrong types', async () => {
		const db = ownerDb(env());
		await assertFails(setDoc(ref(db, 'visa'), statement));
		await assertFails(setDoc(ref(db, 'visa_2026-11-20'), { ...statement, computed: 0 }));
		const { amount: _a, ...none } = statement;
		await assertFails(setDoc(ref(db, 'visa_2026-11-20'), none));
		await assertFails(setDoc(ref(db, 'visa_2026-11-20'), { ...statement, amount: -1 }));
		await assertFails(setDoc(ref(db, 'visa_2026-11-20'), { ...statement, amount: '12500' }));
		await assertFails(setDoc(ref(db, 'visa_2026-11-20'), { ...statement, sources: 'everyday' }));
	});
});
