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
	amount: z.int('Amount must be an integer number of centavos'),
	/** Marks a line from the form's Fees section: added on top of From, or taken out of To. */
	fee: z.enum(['additional', 'less']).optional()
});
export type Entry = z.infer<typeof Entry>;

/** Which Scheduled Transaction or Installment Plan occurrence a Transaction pays (ADR 0003). */
export const PaidLink = z.object({
	plan: z.enum(['scheduled', 'installment']),
	planId: z.string().min(1),
	/** The occurrence's rule date, not a moved date. */
	due: z.iso.date()
});
export type PaidLink = z.infer<typeof PaidLink>;

export const TAG_PATTERN = /^[a-z0-9-]+$/;

/**
 * `users/{uid}/transactions/{txId}` document data. Fields added after the first release have
 * defaults, so older documents still parse; every write stores all fields.
 */
export const TransactionDoc = z
	.object({
		/** Plain calendar date `YYYY-MM-DD`, no timezone; null only for the Opening Balance. */
		date: z.iso.date().nullable(),
		/** How the Transaction came to be. Not its kind (Expense / Income / Transfer), which is derived. */
		origin: z.enum(['opening', 'normal']),
		description: z
			.string()
			.min(1, 'Description is required')
			.max(200, 'Description is at most 200 characters'),
		note: z.string().max(5000, 'Note is at most 5,000 characters').default(''),
		status: z.enum(['cleared', 'pending']).default('cleared'),
		tags: z
			.array(z.string().regex(TAG_PATTERN, 'Tags use lowercase letters, digits and hyphens'))
			.max(50, 'At most 50 tags')
			.refine((tags) => new Set(tags).size === tags.length, 'Tags must not repeat')
			.default([]),
		entries: z
			.array(Entry)
			.min(2, 'A Transaction needs at least two Entries')
			.max(100, 'A Transaction has at most 100 Entries'),
		accountIds: z.array(z.string()),
		pays: PaidLink.nullable().default(null),
		createdAt: z.date(),
		updatedAt: z.date()
	})
	.refine((tx) => tx.entries.reduce((sum, e) => sum + e.amount, 0) === 0, {
		message: 'Entries must add up to zero',
		path: ['entries']
	})
	.refine((tx) => (tx.origin === 'opening') === (tx.date === null), {
		message: 'An Opening Balance has a null date; every other Transaction needs a date',
		path: ['date']
	});
export type TransactionDoc = z.infer<typeof TransactionDoc>;
export type Transaction = TransactionDoc & { id: string };

/** Documents written before the rename store `origin` as `kind`. */
function renameLegacyKind(data: unknown): unknown {
	if (!data || typeof data !== 'object' || !('kind' in data) || 'origin' in data) return data;
	const { kind, ...rest } = data as Record<string, unknown>;
	return { ...rest, origin: kind };
}

/** True for a stored document that still uses the legacy `kind` field. */
export const isLegacyTransaction = (data: unknown) =>
	!!data && typeof data === 'object' && 'kind' in data;

export function parseTransaction(id: string, data: unknown): Transaction {
	return { id, ...TransactionDoc.parse(renameLegacyKind(data)) };
}

export function parseAccount(id: string, data: unknown): Account {
	return { id, ...AccountDoc.parse(data) };
}
