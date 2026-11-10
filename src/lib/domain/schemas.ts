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

/**
 * One line of a Scheduled Transaction. Unlike an Entry the side is explicit, because the amount
 * can be null ("varies", such as an electricity bill) and then has no sign to carry it.
 */
export const PlanLine = z
	.object({
		accountId: z.string().min(1),
		side: z.enum(['from', 'to']),
		/** Positive integer centavos, or null when it varies per occurrence. */
		amount: z.int().positive().nullable(),
		fee: z.enum(['additional', 'less']).optional()
	})
	.refine((l) => !l.fee || l.side === 'to', { message: 'A fee is a To line', path: ['fee'] });
export type PlanLine = z.infer<typeof PlanLine>;

export const RepeatRule = z.discriminatedUnion('type', [
	z.object({ type: z.literal('once'), date: z.iso.date() }),
	/** The 15th and the 30th of every month (the last day of February). */
	z.object({ type: z.literal('cutoff'), start: z.iso.date() }),
	/** Day N of every month; a month without that day uses its last day. */
	z.object({ type: z.literal('monthly'), day: z.int().min(1).max(31), start: z.iso.date() }),
	/** Every N weeks on the start date's weekday. */
	z.object({ type: z.literal('weekly'), every: z.int().min(1).max(52), start: z.iso.date() }),
	/** Every year on the start date's month and day (29 Feb falls on 28 Feb in other years). */
	z.object({ type: z.literal('yearly'), start: z.iso.date() })
]);
export type RepeatRule = z.infer<typeof RepeatRule>;

/** A plan's values in force from a date on ("this and all following" adds one). */
export const PlanVersion = z.object({
	from: z.iso.date(),
	description: z.string().min(1, 'Description is required').max(200),
	note: z.string().max(5000),
	tags: z.array(z.string().regex(TAG_PATTERN)).max(50),
	lines: z
		.array(PlanLine)
		.max(100)
		.refine((ls) => ls.some((l) => l.side === 'from') && ls.some((l) => l.side === 'to'), {
			message: 'A plan needs a line on each side'
		}),
	rule: RepeatRule
});
export type PlanVersion = z.infer<typeof PlanVersion>;

export const PlanEnd = z.discriminatedUnion('type', [
	z.object({ type: z.literal('never') }),
	z.object({ type: z.literal('on'), date: z.iso.date() }),
	/** Counted across every version. */
	z.object({ type: z.literal('after'), count: z.int().min(1) })
]);
export type PlanEnd = z.infer<typeof PlanEnd>;

/** Changes to one occurrence, keyed by its rule date. */
export const OccurrenceChange = z.object({
	skipped: z.boolean().optional(),
	movedTo: z.iso.date().optional(),
	/** Per line of the version in force, replacing the plan's amount; null keeps "varies". */
	amounts: z.array(z.int().positive().nullable()).optional(),
	/** "Mark paid": settled by hand after at least one paying Transaction. */
	settled: z.boolean().optional()
});
export type OccurrenceChange = z.infer<typeof OccurrenceChange>;

/** `users/{uid}/scheduled/{planId}`: a Scheduled Transaction (ADR 0003). */
export const ScheduledDoc = z.object({
	versions: z
		.array(PlanVersion)
		.min(1)
		.max(100)
		.refine((vs) => vs.every((v, i) => i === 0 || vs[i - 1].from < v.from), {
			message: 'Versions must be in date order'
		}),
	end: PlanEnd,
	occurrences: z.record(z.iso.date(), OccurrenceChange).default({}),
	createdAt: z.date(),
	updatedAt: z.date()
});
export type ScheduledDoc = z.infer<typeof ScheduledDoc>;
export type Scheduled = ScheduledDoc & { id: string };

export function parseScheduled(id: string, data: unknown): Scheduled {
	return { id, ...ScheduledDoc.parse(data) };
}

/** A charge billed with an Installment Plan row, such as a processing fee. */
export const Additional = z.object({
	description: z.string().min(1, 'Describe the additional').max(200),
	/** Positive integer centavos. */
	amount: z.int().positive()
});
export type Additional = z.infer<typeof Additional>;

/** One scheduled payment of an Installment Plan (ADR 0004). */
export const InstallmentRow = z.object({
	/** Row number as shown: 0 for an interest/fee-only first row, otherwise from 1. */
	n: z.int().min(0),
	/** The row's identity, set at creation and never changed (the `due` in a paid link). */
	due: z.iso.date(),
	/** Where the row falls now; differs from `due` once moved. */
	date: z.iso.date(),
	/** Non-negative integer centavos. */
	principal: z.int().min(0),
	interest: z.int().min(0),
	additionals: z.array(Additional).max(20),
	/** "Mark paid": settled by hand after at least one paying Transaction. */
	settled: z.boolean().optional()
});
export type InstallmentRow = z.infer<typeof InstallmentRow>;

/** `users/{uid}/installments/{planId}`: an Installment Plan with explicit rows (ADR 0004). */
export const InstallmentDoc = z.object({
	/** Owed to a lender (a Liability), or an Internal Installment Plan repaying an Asset. */
	kind: z.enum(['lender', 'internal']),
	title: z.string().min(1, 'Title is required').max(200, 'Title is at most 200 characters'),
	note: z.string().max(5000).default(''),
	tags: z
		.array(z.string().regex(TAG_PATTERN, 'Tags use lowercase letters, digits and hyphens'))
		.max(50)
		.refine((tags) => new Set(tags).size === tags.length, 'Tags must not repeat')
		.default([]),
	purchaseDate: z.iso.date(),
	/** Flat until any row is edited by itself. */
	entry: z.enum(['flat', 'varied']),
	/** Generates dates at creation and continues them for a row added at the end. */
	rule: RepeatRule,
	/** Rows numbered below this are Before tracking. */
	trackedFrom: z.int().min(0),
	accounts: z.object({
		/** The plan's Liability Leaf (lender) or the Asset it repays (internal). */
		repaid: z.string().min(1),
		paying: z.string().min(1),
		/** Expense Leaves; null for an Internal Installment Plan. */
		interest: z.string().min(1).nullable(),
		fees: z.string().min(1).nullable()
	}),
	rows: z.array(InstallmentRow).min(1, 'A plan needs at least one row').max(600),
	/** The Transaction this plan was made from, if any; it may since have been deleted. */
	madeFrom: z.string().min(1).nullable().optional(),
	createdAt: z.date(),
	updatedAt: z.date()
});
export type InstallmentDoc = z.infer<typeof InstallmentDoc>;
export type Installment = InstallmentDoc & { id: string };

export function parseInstallment(id: string, data: unknown): Installment {
	return { id, ...InstallmentDoc.parse(data) };
}
