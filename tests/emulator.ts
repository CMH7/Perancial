// Shared setup for tests that run against the Firestore emulator (bun run test:rules).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { OWNER_UID } from '../src/lib/owner.ts';
import { accountsPath, systemAccounts } from '../src/lib/firebase/ledger.ts';
import type { AccountDoc } from '../src/lib/domain/index.ts';

export { OWNER_UID };

/** Registers before/after hooks and returns a getter for the test environment. */
export function useEmulator(): () => RulesTestEnvironment {
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
	return () => env;
}

export const ownerDb = (env: RulesTestEnvironment) =>
	env.authenticatedContext(OWNER_UID).firestore() as unknown as Firestore;

/** Writes the System Accounts with rules disabled, as a starting point for rules tests. */
export async function seedSystemAccounts(env: RulesTestEnvironment) {
	await env.withSecurityRulesDisabled(async (ctx) => {
		const db = ctx.firestore() as unknown as Firestore;
		for (const [id, data] of systemAccounts(new Date()))
			await setDoc(doc(db, accountsPath(OWNER_UID), id), data);
	});
}

/** A valid user Account document. */
export function accountData(overrides: Partial<AccountDoc> = {}): AccountDoc {
	const now = new Date();
	return {
		name: 'Cash on Hand',
		description: '',
		type: 'asset',
		parentId: 'asset',
		system: null,
		archived: false,
		order: 0,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
}
