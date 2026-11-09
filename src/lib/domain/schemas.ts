import { z } from 'zod';

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export const AccountType = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof AccountType>;

/** `users/{uid}/accounts/{accountId}` document data. Timestamps arrive as `Date`. */
export const AccountDoc = z.object({
	name: z.string(),
	description: z.string(),
	type: AccountType,
	parentId: z.string().nullable(),
	system: z.enum(['root', 'opening-balances']).nullable(),
	archived: z.boolean(),
	/** Manual position among siblings (ascending). */
	order: z.number(),
	createdAt: z.date(),
	updatedAt: z.date()
});
export type AccountDoc = z.infer<typeof AccountDoc>;
export type Account = AccountDoc & { id: string };

export const Entry = z.object({
	accountId: z.string(),
	/** Signed integer centavos (storage sign: Asset/Expense increases positive). */
	amount: z.int('Amount must be an integer number of centavos')
});
export type Entry = z.infer<typeof Entry>;

/** `users/{uid}/transactions/{txId}` document data. */
export const TransactionDoc = z
	.object({
		/** Plain calendar date `YYYY-MM-DD`, no timezone; null only for the Opening Balance. */
		date: z.iso.date().nullable(),
		kind: z.enum(['opening', 'normal']),
		description: z.string(),
		entries: z.array(Entry).min(2, 'A Transaction needs at least two Entries'),
		accountIds: z.array(z.string()),
		createdAt: z.date(),
		updatedAt: z.date()
	})
	.refine((tx) => tx.entries.reduce((sum, e) => sum + e.amount, 0) === 0, {
		message: 'Entries must add up to zero',
		path: ['entries']
	})
	.refine((tx) => (tx.kind === 'opening') === (tx.date === null), {
		message: 'An Opening Balance has a null date; every other Transaction needs a date',
		path: ['date']
	});
export type TransactionDoc = z.infer<typeof TransactionDoc>;
export type Transaction = TransactionDoc & { id: string };

export function parseTransaction(id: string, data: unknown): Transaction {
	return { id, ...TransactionDoc.parse(data) };
}

export function parseAccount(id: string, data: unknown): Account {
	return { id, ...AccountDoc.parse(data) };
}
