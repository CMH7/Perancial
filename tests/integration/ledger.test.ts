import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { accountsPath, commitLedger, ensureSystemAccounts } from '../../src/lib/firebase/ledger.ts';
import { buildChart } from '../../src/lib/domain/index.ts';
import { OWNER_UID, accountData, firstSnapshot, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();

describe('ensureSystemAccounts', () => {
	it('creates the five Root Accounts and Opening Balances exactly once', async () => {
		const db = ownerDb(env());
		expect(await ensureSystemAccounts(db, OWNER_UID)).toBe(6);
		expect(await ensureSystemAccounts(db, OWNER_UID)).toBe(0);

		const { accounts } = await firstSnapshot(db, (s) => s.accounts.length === 6);
		expect(accounts.map((a) => a.id).sort()).toEqual(
			['asset', 'equity', 'expense', 'income', 'liability', 'opening-balances'].sort()
		);
		expect(accounts.find((a) => a.id === 'equity')?.description).toMatch(/starting point/);
	});
});

describe('subscribeLedger', () => {
	it('publishes parsed Accounts and Transactions that the Chart can use', async () => {
		const db = ownerDb(env());
		await ensureSystemAccounts(db, OWNER_UID);
		const now = new Date();
		await commitLedger(db, OWNER_UID, [
			{ op: 'setAccount', id: 'cash', data: accountData() },
			{
				op: 'setTransaction',
				id: 'opening_cash',
				data: {
					date: null,
					kind: 'opening',
					description: 'Opening Balance',
					entries: [
						{ accountId: 'cash', amount: 345000 },
						{ accountId: 'opening-balances', amount: -345000 }
					],
					accountIds: ['cash', 'opening-balances'],
					createdAt: now,
					updatedAt: now
				}
			}
		]);

		const { accounts, transactions } = await firstSnapshot(
			db,
			(s) => s.accounts.length === 7 && s.transactions.length === 1
		);
		const cash = accounts.find((a) => a.id === 'cash')!;
		expect(cash.createdAt).toBeInstanceOf(Date);
		expect(buildChart(accounts, transactions).totals().netWorth).toBe(345000);
	});

	it('reports a malformed document instead of publishing data', async () => {
		const db = ownerDb(env());
		await ensureSystemAccounts(db, OWNER_UID);
		await env().withSecurityRulesDisabled(async (ctx) => {
			const raw = ctx.firestore() as unknown as Firestore;
			await setDoc(doc(raw, accountsPath(OWNER_UID), 'broken'), { name: 42 });
		});
		await expect(firstSnapshot(db)).rejects.toThrow(/Malformed document .*broken/);
	});
});

describe('commitLedger', () => {
	it('validates with Zod before writing anything', async () => {
		const db = ownerDb(env());
		await expect(
			commitLedger(db, OWNER_UID, [
				{ op: 'setAccount', id: 'ok', data: accountData() },
				{ op: 'setAccount', id: 'bad', data: accountData({ order: 'first' as never }) }
			])
		).rejects.toThrow();
		const { accounts } = await firstSnapshot(db);
		expect(accounts).toEqual([]);
	});
});
