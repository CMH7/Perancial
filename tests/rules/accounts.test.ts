import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { beforeEach, describe, it } from 'vitest';
import { accountsPath } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, accountData, ownerDb, seedSystemAccounts, useEmulator } from '../emulator.ts';

const env = useEmulator();
beforeEach(() => seedSystemAccounts(env()));
const ref = (id: string) => doc(ownerDb(env()), accountsPath(OWNER_UID), id);

describe('System Accounts', () => {
	it('cannot be deleted', async () => {
		await assertFails(deleteDoc(ref('asset')));
		await assertFails(deleteDoc(ref('opening-balances')));
	});

	it('Root Accounts allow editing the description only', async () => {
		await assertSucceeds(
			updateDoc(ref('expense'), { description: 'Where my money goes', updatedAt: new Date() })
		);
		await assertFails(updateDoc(ref('expense'), { name: 'Spending' }));
		await assertFails(updateDoc(ref('expense'), { archived: true }));
	});

	it('Opening Balances is fully locked', async () => {
		await assertFails(updateDoc(ref('opening-balances'), { description: 'x' }));
	});

	it('cannot be created at a non-system ID or impersonated', async () => {
		await assertFails(
			setDoc(ref('fake-root'), accountData({ system: 'root', parentId: null, type: 'asset' }))
		);
		await assertFails(setDoc(ref('asset'), accountData({ system: null })));
	});
});

describe('user Accounts', () => {
	it('must have the same Account Type as their parent', async () => {
		await assertSucceeds(setDoc(ref('cash'), accountData({ type: 'asset', parentId: 'asset' })));
		await assertFails(setDoc(ref('loan'), accountData({ type: 'liability', parentId: 'asset' })));
	});

	it('need an existing parent, which a batch may create alongside them', async () => {
		await assertFails(setDoc(ref('orphan'), accountData({ parentId: 'missing' })));
		const db = ownerDb(env());
		const batch = writeBatch(db);
		const inBatch = (id: string) => doc(db, accountsPath(OWNER_UID), id);
		batch.set(inBatch('maribank'), accountData({ name: 'MariBank', parentId: 'asset' }));
		batch.set(inBatch('savings'), accountData({ name: 'Savings', parentId: 'maribank' }));
		await assertSucceeds(batch.commit());
	});

	it('cannot sit under Opening Balances', async () => {
		await assertFails(
			setDoc(ref('x'), accountData({ type: 'equity', parentId: 'opening-balances' }))
		);
	});

	it('reject unknown or missing fields and wrong types', async () => {
		await assertFails(setDoc(ref('cash'), { ...accountData(), balance: 500000 }));
		const noOrder: Record<string, unknown> = { ...accountData() };
		delete noOrder.order;
		await assertFails(setDoc(ref('cash'), noOrder));
		await assertFails(setDoc(ref('cash'), accountData({ type: 'savings' as never })));
	});

	it('can be edited and deleted', async () => {
		await setDoc(ref('cash'), accountData());
		await assertSucceeds(updateDoc(ref('cash'), { name: 'Wallet', updatedAt: new Date() }));
		await assertSucceeds(deleteDoc(ref('cash')));
	});
});
