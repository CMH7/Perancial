import { describe, expect, it } from 'vitest';
import { buildChart, planCreateAccount } from '../../src/lib/domain/index.ts';
import { commitLedger, ensureSystemAccounts, newAccountId } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, firstSnapshot, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();

describe('creating Accounts through the rules', () => {
	it('saves a Group with children and Opening Balances, then converts a Leaf with money', async () => {
		const db = ownerDb(env());
		await ensureSystemAccounts(db, OWNER_UID);
		const newId = () => newAccountId(db, OWNER_UID);

		let chart = buildChart(
			...Object.values(await firstSnapshot(db, (s) => s.accounts.length === 6))
		);
		await commitLedger(
			db,
			OWNER_UID,
			planCreateAccount(
				chart,
				{
					parentId: 'asset',
					name: 'MariBank',
					description: 'Digital bank',
					openingBalance: 0,
					children: [
						{ name: 'Savings', description: '', openingBalance: 4500000 },
						{ name: 'Goals', description: '', openingBalance: 2000000 }
					]
				},
				{ newId, now: new Date() }
			)
		);

		let snap = await firstSnapshot(db, (s) => s.accounts.length === 9);
		chart = buildChart(snap.accounts, snap.transactions);
		const maribank = snap.accounts.find((a) => a.name === 'MariBank')!;
		const savings = snap.accounts.find((a) => a.name === 'Savings')!;
		expect(chart.balance(maribank.id)).toBe(6500000);

		// Adding under Savings (a Leaf holding money) converts it; totals stay the same.
		await commitLedger(
			db,
			OWNER_UID,
			planCreateAccount(
				chart,
				{ parentId: savings.id, name: 'Main', description: '', openingBalance: 0, children: [] },
				{ newId, now: new Date() }
			)
		);
		snap = await firstSnapshot(db, (s) => s.accounts.length === 10);
		chart = buildChart(snap.accounts, snap.transactions);
		const group = snap.accounts.find((a) => a.name === 'Savings')!;
		expect(group.id).not.toBe(savings.id);
		expect(chart.account(savings.id)).toMatchObject({ name: 'Main', parentId: group.id });
		expect(chart.balance(group.id)).toBe(4500000);
		expect(chart.balance(maribank.id)).toBe(6500000);
		expect(snap.transactions).toHaveLength(2);
	});
});
