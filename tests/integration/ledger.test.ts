import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
	accountsPath,
	commitLedger,
	commitLedgerInBatches,
	ensureSystemAccounts,
	migrateLegacyTransactions,
	transactionsPath
} from '../../src/lib/firebase/ledger.ts';
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
					origin: 'opening',
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

describe('migrateLegacyTransactions', () => {
	it('rewrites documents that still use kind into the full v2 shape, once', async () => {
		const db = ownerDb(env());
		const now = new Date();
		await env().withSecurityRulesDisabled(async (ctx) => {
			const raw = ctx.firestore() as unknown as Firestore;
			await setDoc(doc(raw, transactionsPath(OWNER_UID), 'opening_cash'), {
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
			});
		});

		expect(await migrateLegacyTransactions(db, OWNER_UID)).toBe(1);
		expect(await migrateLegacyTransactions(db, OWNER_UID)).toBe(0);

		const stored = (await getDoc(doc(db, transactionsPath(OWNER_UID), 'opening_cash'))).data();
		expect(stored).not.toHaveProperty('kind');
		expect(stored).toMatchObject({
			origin: 'opening',
			note: '',
			status: 'cleared',
			tags: [],
			pays: null
		});
	});
});

describe('commitLedgerInBatches', () => {
	it('commits more writes than one Firestore batch allows', async () => {
		const db = ownerDb(env());
		const now = new Date();
		const writes = Array.from({ length: 501 }, (_, i) => ({
			op: 'setTransaction' as const,
			id: `tx${i}`,
			data: {
				date: '2026-11-01',
				origin: 'normal' as const,
				description: `Lunch ${i}`,
				note: '',
				status: 'cleared' as const,
				tags: ['lunch'],
				entries: [
					{ accountId: 'food', amount: 100 },
					{ accountId: 'cash', amount: -100 }
				],
				accountIds: ['food', 'cash'],
				pays: null,
				createdAt: now,
				updatedAt: now
			}
		}));
		await commitLedgerInBatches(db, OWNER_UID, writes);
		const { transactions } = await firstSnapshot(db, (s) => s.transactions.length === 501);
		expect(transactions).toHaveLength(501);
	});
});

describe('Scheduled Transactions in the ledger', () => {
	it('commits, publishes and deletes a plan', async () => {
		const db = ownerDb(env());
		const now = new Date();
		const data = {
			versions: [
				{
					from: '2026-01-05',
					description: 'Rent',
					note: '',
					tags: [],
					lines: [
						{ accountId: 'bpi', side: 'from' as const, amount: null },
						{ accountId: 'rent', side: 'to' as const, amount: 1200000 }
					],
					rule: { type: 'monthly' as const, day: 5, start: '2026-01-05' }
				}
			],
			end: { type: 'never' as const },
			occurrences: { '2026-02-05': { skipped: true } },
			createdAt: now,
			updatedAt: now
		};
		await commitLedger(db, OWNER_UID, [{ op: 'setScheduled', id: 'p1', data }]);
		const { scheduled } = await firstSnapshot(db, (s) => s.scheduled.length === 1);
		expect(scheduled[0]).toMatchObject({ id: 'p1', end: { type: 'never' } });
		expect(scheduled[0].occurrences['2026-02-05']).toEqual({ skipped: true });
		expect(scheduled[0].createdAt).toBeInstanceOf(Date);

		await commitLedger(db, OWNER_UID, [{ op: 'deleteScheduled', id: 'p1' }]);
		await firstSnapshot(db, (s) => s.scheduled.length === 0);
	});
});
