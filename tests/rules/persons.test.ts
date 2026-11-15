import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { personsPath } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();
const now = new Date();
const stranger = () =>
	env().authenticatedContext('stranger-uid').firestore() as unknown as Firestore;
const person = { name: 'Partner', archived: false, createdAt: now, updatedAt: now };
const ref = (db: Firestore, id: string) => doc(db, personsPath(OWNER_UID), id);

describe('Persons', () => {
	it('let the owner write and read a Person', async () => {
		const db = ownerDb(env());
		await assertSucceeds(setDoc(ref(db, 'p1'), person));
		await assertSucceeds(getDoc(ref(db, 'p1')));
	});

	it('keep everyone else out', async () => {
		await assertFails(setDoc(ref(stranger(), 'p1'), person));
		await assertFails(getDoc(ref(stranger(), 'p1')));
	});

	it('reject the id reserved for Me, extra or missing keys and wrong types', async () => {
		const db = ownerDb(env());
		await assertFails(setDoc(ref(db, 'me'), person));
		await assertFails(setDoc(ref(db, 'p1'), { ...person, balance: 0 }));
		const { archived: _a, ...none } = person;
		await assertFails(setDoc(ref(db, 'p1'), none));
		await assertFails(setDoc(ref(db, 'p1'), { ...person, name: '' }));
		await assertFails(setDoc(ref(db, 'p1'), { ...person, archived: 'no' }));
	});
});
