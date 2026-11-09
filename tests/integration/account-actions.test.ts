import { describe, expect, it } from 'vitest';
import {
	buildChart,
	planCreateAccount,
	planDeleteAccount,
	planDropAccount,
	planMoveAccount,
	planSetArchived,
	type Chart
} from '../../src/lib/domain/index.ts';
import { commitLedger, ensureSystemAccounts, newAccountId } from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, firstSnapshot, ownerDb, useEmulator } from '../emulator.ts';
import type { LedgerSnapshot } from '../../src/lib/firebase/ledger.ts';

const env = useEmulator();

describe('move, archive, and delete through the rules', () => {
	it('moves a Group with its children, archives it, unarchives it, then deletes it', async () => {
		const db = ownerDb(env());
		await ensureSystemAccounts(db, OWNER_UID);
		const now = () => ({ now: new Date() });
		const newId = () => newAccountId(db, OWNER_UID);
		let snap: LedgerSnapshot = await firstSnapshot(db, (s) => s.accounts.length === 6);
		const chart = (): Chart => buildChart(snap.accounts, snap.transactions);
		const wait = async (until: (s: LedgerSnapshot) => boolean) => {
			snap = await firstSnapshot(db, until);
		};

		await commitLedger(
			db,
			OWNER_UID,
			planCreateAccount(
				chart(),
				{ parentId: 'asset', name: 'Banks', description: '', openingBalance: 0, children: [] },
				{ newId, ...now() }
			)
		);
		await wait((s) => s.accounts.length === 7);
		const banks = snap.accounts.find((a) => a.name === 'Banks')!;
		await commitLedger(
			db,
			OWNER_UID,
			planCreateAccount(
				chart(),
				{
					parentId: 'asset',
					name: 'Goals',
					description: '',
					openingBalance: 0,
					children: [{ name: 'Travel', description: '', openingBalance: 850000 }]
				},
				{ newId, ...now() }
			)
		);
		await wait((s) => s.accounts.length === 9);
		const goals = snap.accounts.find((a) => a.name === 'Goals')!;

		await commitLedger(db, OWNER_UID, planMoveAccount(chart(), goals.id, banks.id, now()));
		await wait((s) => s.accounts.some((a) => a.id === goals.id && a.parentId === banks.id));
		expect(chart().balance(banks.id)).toBe(850000);

		// Can't archive with money; delete is allowed (Opening Balances only) and takes everything.
		expect(() => planSetArchived(chart(), banks.id, true, now())).toThrow(/Balance is/);
		await commitLedger(db, OWNER_UID, planDeleteAccount(chart(), banks.id));
		await wait((s) => s.accounts.length === 6 && s.transactions.length === 0);

		// Archive and unarchive an empty Account.
		await commitLedger(
			db,
			OWNER_UID,
			planCreateAccount(
				chart(),
				{ parentId: 'asset', name: 'Old', description: '', openingBalance: 0, children: [] },
				{ newId, ...now() }
			)
		);
		await wait((s) => s.accounts.length === 7);
		const old = snap.accounts.find((a) => a.name === 'Old')!;
		await commitLedger(db, OWNER_UID, planSetArchived(chart(), old.id, true, now()));
		await wait((s) => s.accounts.some((a) => a.id === old.id && a.archived));
		await commitLedger(db, OWNER_UID, planSetArchived(chart(), old.id, false, now()));
		await wait((s) => s.accounts.some((a) => a.id === old.id && !a.archived));
	});

	it('reorders siblings by drag-and-drop without touching Balances or parents', async () => {
		const db = ownerDb(env());
		await ensureSystemAccounts(db, OWNER_UID);
		let snap: LedgerSnapshot = await firstSnapshot(db, (s) => s.accounts.length === 6);
		for (const [name, openingBalance] of [
			['Cash', 100000],
			['Bank', 200000],
			['Wallet', 0]
		] as const) {
			await commitLedger(
				db,
				OWNER_UID,
				planCreateAccount(
					buildChart(snap.accounts, snap.transactions),
					{ parentId: 'asset', name, description: '', openingBalance, children: [] },
					{ newId: () => newAccountId(db, OWNER_UID), now: new Date() }
				)
			);
			const count = snap.accounts.length + 1;
			snap = await firstSnapshot(db, (s) => s.accounts.length === count);
		}
		const id = (name: string) => snap.accounts.find((a) => a.name === name)!.id;
		const before = buildChart(snap.accounts, snap.transactions);

		await commitLedger(
			db,
			OWNER_UID,
			planDropAccount(before, id('Wallet'), id('Cash'), { now: new Date() })
		);

		// A fresh listener stands in for a reload on another device.
		const fresh = await firstSnapshot(ownerDb(env()), (s) =>
			s.accounts.some((a) => a.name === 'Wallet' && a.order === 0)
		);
		const after = buildChart(fresh.accounts, fresh.transactions);
		expect(after.children('asset').map((a) => a.name)).toEqual(['Wallet', 'Cash', 'Bank']);
		for (const name of ['Cash', 'Bank', 'Wallet']) {
			expect(after.balance(id(name))).toBe(before.balance(id(name)));
			expect(after.account(id(name))?.parentId).toBe('asset');
		}
		expect(after.balance('asset')).toBe(300000);
	});
});
