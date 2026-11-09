import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { beforeEach, describe, it } from 'vitest';
import { OWNER_UID, accountData, ownerDb, seedSystemAccounts, useEmulator } from '../emulator.ts';

const env = useEmulator();
beforeEach(() => seedSystemAccounts(env()));

describe('owner-only access', () => {
	it('lets the owner read and write their own data', async () => {
		const db = ownerDb(env());
		await assertSucceeds(setDoc(doc(db, `users/${OWNER_UID}/accounts/cash`), accountData()));
		await assertSucceeds(getDoc(doc(db, `users/${OWNER_UID}/accounts/cash`)));
	});

	it('denies another signed-in account, even in its own users/{uid} silo', async () => {
		const db = env().authenticatedContext('stranger').firestore() as unknown as Firestore;
		await assertFails(setDoc(doc(db, 'users/stranger/accounts/cash'), accountData()));
		await assertFails(getDoc(doc(db, `users/${OWNER_UID}/accounts/asset`)));
	});

	it('denies signed-out access', async () => {
		const db = env().unauthenticatedContext().firestore() as unknown as Firestore;
		await assertFails(getDoc(doc(db, `users/${OWNER_UID}/accounts/asset`)));
	});

	it('denies top-level collections, even for the owner', async () => {
		await assertFails(setDoc(doc(ownerDb(env()), 'accounts/cash'), accountData()));
	});
});
