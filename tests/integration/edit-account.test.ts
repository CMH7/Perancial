import { describe, expect, it } from 'vitest';
import { buildChart, planCreateAccount, planEditAccount } from '../../src/lib/domain/index.ts';
import { commitLedger, ensureSystemAccounts, newAccountId } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, firstSnapshot, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();

describe('editing Accounts through the rules', () => {
	it('renames, changes and clears an Opening Balance, and edits a Root description', async () => {
		const db = ownerDb(env());
		await ensureSystemAccounts(db, OWNER_UID);
		let snap = await firstSnapshot(db, (s) => s.accounts.length === 6);
		const id = newAccountId(db, OWNER_UID);
		await commitLedger(
			db,
			OWNER_UID,
			planCreateAccount(
				buildChart(snap.accounts, snap.transactions),
				{ parentId: 'asset', name: 'Cash', description: '', openingBalance: 345000, children: [] },
				{ newId: () => id, now: new Date() }
			)
		);

		const save = async (accountId: string, input: Parameters<typeof planEditAccount>[2]) => {
			const chart = buildChart(snap.accounts, snap.transactions);
			await commitLedger(
				db,
				OWNER_UID,
				planEditAccount(chart, accountId, input, { now: new Date() })
			);
		};

		snap = await firstSnapshot(db, (s) => s.transactions.length === 1);
		await save(id, { name: 'Wallet', description: 'Daily', openingBalance: 500000 });
		snap = await firstSnapshot(db, (s) =>
			s.transactions.some((t) => t.entries[0].amount === 500000)
		);
		let chart = buildChart(snap.accounts, snap.transactions);
		expect(chart.account(id)?.name).toBe('Wallet');
		expect(chart.balance(id)).toBe(500000);

		await save(id, { name: 'Wallet', description: 'Daily', openingBalance: 0 });
		snap = await firstSnapshot(db, (s) => s.transactions.length === 0);
		expect(buildChart(snap.accounts, snap.transactions).balance(id)).toBe(0);

		await save('expense', {
			name: 'ignored',
			description: 'Where my money goes',
			openingBalance: 0
		});
		snap = await firstSnapshot(db, (s) =>
			s.accounts.some((a) => a.description === 'Where my money goes')
		);
		chart = buildChart(snap.accounts, snap.transactions);
		expect(chart.account('expense')).toMatchObject({ name: 'Expenses' });
	});
});
