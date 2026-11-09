import { readFileSync } from 'node:fs';
import {
	assertFails,
	initializeTestEnvironment,
	type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

// Smoke test for the emulator wiring. Owner-only rules and their tests arrive with issue #11.
let env: RulesTestEnvironment;

beforeAll(async () => {
	env = await initializeTestEnvironment({
		projectId: 'demo-perancial',
		firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
	});
});

afterAll(async () => {
	await env?.cleanup();
});

describe('firestore.rules (deny-all placeholder)', () => {
	it('denies reads and writes, even when signed in', async () => {
		const db = env.authenticatedContext('someone').firestore();
		await assertFails(getDoc(doc(db, 'users/someone/accounts/asset')));
		await assertFails(setDoc(doc(db, 'users/someone/accounts/asset'), { name: 'Assets' }));
	});
});
