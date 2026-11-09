// Test-only builders for Accounts and Transactions.
import type { Account, AccountType, Transaction } from './schemas.ts';

export const now = new Date('2026-11-09T00:00:00Z');

export function account(
	id: string,
	type: AccountType,
	parentId: string | null,
	extra: Partial<Account> = {}
): Account {
	return {
		id,
		name: id,
		description: '',
		type,
		parentId,
		system: parentId === null ? 'root' : null,
		archived: false,
		order: 0,
		createdAt: now,
		updatedAt: now,
		...extra
	};
}

export const roots = [
	account('asset', 'asset', null),
	account('liability', 'liability', null),
	account('equity', 'equity', null),
	account('income', 'income', null),
	account('expense', 'expense', null),
	account('opening-balances', 'equity', 'equity', { system: 'opening-balances' })
];

/** Opening Balance in storage sign (Asset positive, Liability negative), against Opening Balances. */
export function opening(accountId: string, amount: number): Transaction {
	return {
		id: `opening_${accountId}`,
		date: null,
		kind: 'opening',
		description: 'Opening Balance',
		entries: [
			{ accountId, amount },
			{ accountId: 'opening-balances', amount: -amount }
		],
		accountIds: [accountId, 'opening-balances'],
		createdAt: now,
		updatedAt: now
	};
}

export function tx(id: string, date: string, entries: [string, number][]): Transaction {
	return {
		id,
		date,
		kind: 'normal',
		description: id,
		entries: entries.map(([accountId, amount]) => ({ accountId, amount })),
		accountIds: entries.map(([accountId]) => accountId),
		createdAt: now,
		updatedAt: now
	};
}
