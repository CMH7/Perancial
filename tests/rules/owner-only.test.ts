import { readFileSync } from 'node:fs';
import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { OWNER_UID } from '../../src/lib/owner.ts';

let env: RulesTestEnvironment;

beforeAll(async () => {
	env = await initializeTestEnvironment({
		projectId: 'demo-perancial',
		firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
	});
});

beforeEach(async () => {
	await env.clearFirestore();
});

afterAll(async () => {
	await env?.cleanup();
});

const account = { name: 'Cash on Hand' };

describe('owner-only access', () => {
	it('lets the owner read and write their own data', async () => {
		const db = env.authenticatedContext(OWNER_UID).firestore();
		await assertSucceeds(setDoc(doc(db, `users/${OWNER_UID}/accounts/cash`), account));
		await assertSucceeds(getDoc(doc(db, `users/${OWNER_UID}/accounts/cash`)));
	});

	it('denies another signed-in account, even in its own users/{uid} silo', async () => {
		const db = env.authenticatedContext('stranger').firestore();
		await assertFails(setDoc(doc(db, 'users/stranger/accounts/cash'), account));
		await assertFails(getDoc(doc(db, `users/${OWNER_UID}/accounts/cash`)));
	});

	it('denies signed-out access', async () => {
		const db = env.unauthenticatedContext().firestore();
		await assertFails(getDoc(doc(db, `users/${OWNER_UID}/accounts/cash`)));
	});

	it('denies top-level collections, even for the owner', async () => {
		const db = env.authenticatedContext(OWNER_UID).firestore();
		await assertFails(setDoc(doc(db, 'accounts/cash'), account));
	});
});
