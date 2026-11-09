// PROTOTYPE, throwaway. Shared stubs and helpers for the Transaction form variants (ticket #30).
// Not domain code: the validated rules get rewritten test-first in src/lib/domain.
import { parseAmount, type Account, type AccountType, type Entry } from '#lib/domain/index.ts';

export type Leaf = { id: string; name: string; path: string; type: AccountType };

/** A from/to line as typed. `amount` is raw text; blank means "fill with the remainder". */
export type Line = { accountId: string; amount: string };

/** A past Transaction, as shown in "Duplicate" pickers. */
export type PastTx = {
	date: string;
	description: string;
	from: { accountId: string; cents: number }[];
	to: { accountId: string; cents: number }[];
};

const leaf = (id: string, type: AccountType, path: string): Leaf => ({
	id,
	type,
	path,
	name: path.split(' › ').at(-1)!
});

/** Used when the owner isn't signed in (or has no Leaf Accounts yet). */
export const STUB_LEAVES: Leaf[] = [
	leaf('bpi', 'asset', 'Assets › Banks › BPI Savings'),
	leaf('gcash', 'asset', 'Assets › E-wallets › GCash'),
	leaf('maya', 'asset', 'Assets › E-wallets › Maya'),
	leaf('cash', 'asset', 'Assets › Cash on hand'),
	leaf('lent-ana', 'asset', 'Assets › Receivables › Ana'),
	leaf('cc-bdo', 'liability', 'Liabilities › Credit cards › BDO Visa'),
	leaf('loan-sss', 'liability', 'Liabilities › Loans › SSS salary loan'),
	leaf('salary', 'income', 'Income › Salary'),
	leaf('interest', 'income', 'Income › Interest'),
	leaf('food', 'expense', 'Expenses › Food › Groceries'),
	leaf('dining', 'expense', 'Expenses › Food › Dining out'),
	leaf('rent', 'expense', 'Expenses › Housing › Rent'),
	leaf('bank-fees', 'expense', 'Expenses › Fees › Bank and transfer fees'),
	leaf('tax', 'expense', 'Expenses › Taxes › Withholding tax')
];

export const STUB_RECENT: PastTx[] = [
	{
		date: '2026-11-08',
		description: 'Groceries at SM',
		from: [{ accountId: 'cc-bdo', cents: 245_000 }],
		to: [{ accountId: 'food', cents: 245_000 }]
	},
	{
		date: '2026-10-30',
		description: 'Salary, 2nd cut-off',
		from: [{ accountId: 'salary', cents: 2_500_000 }],
		to: [
			{ accountId: 'bpi', cents: 2_350_000 },
			{ accountId: 'tax', cents: 150_000 }
		]
	},
	{
		date: '2026-10-28',
		description: 'Send to GCash',
		from: [{ accountId: 'bpi', cents: 501_500 }],
		to: [
			{ accountId: 'gcash', cents: 500_000 },
			{ accountId: 'bank-fees', cents: 1_500 }
		]
	},
	{
		date: '2026-10-25',
		description: 'Dinner split with Ana',
		from: [
			{ accountId: 'gcash', cents: 100_000 },
			{ accountId: 'cash', cents: 50_000 }
		],
		to: [
			{ accountId: 'dining', cents: 75_000 },
			{ accountId: 'lent-ana', cents: 75_000 }
		]
	}
];

/** Non-archived, non-root Accounts without children, with their full path. */
export function leavesFrom(accounts: Account[]): Leaf[] {
	const byId = new Map(accounts.map((a) => [a.id, a]));
	const parents = new Set(accounts.map((a) => a.parentId));
	const pathOf = (a: Account): string => {
		const parent = a.parentId ? byId.get(a.parentId) : undefined;
		return parent ? `${pathOf(parent)} › ${a.name}` : a.name;
	};
	return accounts
		.filter((a) => !a.archived && a.system !== 'root' && !parents.has(a.id))
		.map((a) => ({ id: a.id, name: a.name, type: a.type, path: pathOf(a) }))
		.sort((a, b) => a.path.localeCompare(b.path));
}

export type Kind = 'Expense' | 'Income' | 'Transfer' | 'Income and Expense' | null;

/**
 * Derived, never chosen: money reaching an Expense makes it an Expense, money leaving an
 * Income makes it Income, anything else (Asset/Liability/Equity only) is a Transfer.
 * Paying with a credit card is still an Expense: the Liability source doesn't change the kind.
 */
export function kindOf(fromTypes: AccountType[], toTypes: AccountType[]): Kind {
	if (fromTypes.length === 0 || toTypes.length === 0) return null;
	const expense = toTypes.includes('expense');
	const income = fromTypes.includes('income');
	if (expense && income) return 'Income and Expense';
	if (expense) return 'Expense';
	if (income) return 'Income';
	return 'Transfer';
}

export const KIND_STYLE: Record<NonNullable<Kind>, string> = {
	Expense: 'bg-rose-100 text-rose-800',
	Income: 'bg-emerald-100 text-emerald-800',
	Transfer: 'bg-sky-100 text-sky-800',
	'Income and Expense': 'bg-violet-100 text-violet-800'
};

export type Evaluated = {
	/** Parsed amounts per line, with the one blank line filled by the remainder. */
	from: (number | null)[];
	to: (number | null)[];
	/** Index of the auto-filled line, if any. */
	filled: { side: 'from' | 'to'; index: number } | null;
	fromTotal: number;
	toTotal: number;
	errors: string[];
	entries: Entry[];
	kind: Kind;
};

/**
 * Parses both sides, fills the single blank amount (if exactly one) with whatever balances,
 * and builds Entries. Source lines lose money (storage −amount), destination lines gain
 * (storage +amount); that holds for every Account Type, so no per-type sign logic is needed.
 */
export function evaluate(from: Line[], to: Line[], leaves: Leaf[]): Evaluated {
	const errors: string[] = [];
	const typeOf = (id: string) => leaves.find((l) => l.id === id)?.type;
	const parse = (l: Line) => (l.amount.trim() === '' ? null : parseAmount(l.amount));
	const f = from.map(parse);
	const t = to.map(parse);

	for (const [side, lines, parsed] of [
		['From', from, f],
		['To', to, t]
	] as const) {
		lines.forEach((l, i) => {
			if (l.amount.trim() !== '' && parsed[i] === null)
				errors.push(`${side} line ${i + 1}: "${l.amount}" isn't an amount (max 2 decimals)`);
			else if (parsed[i] !== null && parsed[i]! < 0)
				errors.push(`${side} line ${i + 1}: amounts are positive; put it on the other side`);
			else if (parsed[i] === 0) errors.push(`${side} line ${i + 1}: amount can't be zero`);
			if (!l.accountId) errors.push(`${side} line ${i + 1}: pick an Account`);
		});
	}

	const blanks = [
		...from.map((l, i) => (l.amount.trim() === '' ? { side: 'from' as const, index: i } : null)),
		...to.map((l, i) => (l.amount.trim() === '' ? { side: 'to' as const, index: i } : null))
	].filter((x) => x !== null);
	const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

	let filled: Evaluated['filled'] = null;
	if (blanks.length === 1) {
		const b = blanks[0];
		const remainder = b.side === 'from' ? sum(t) - sum(f) : sum(f) - sum(t);
		if (remainder > 0) {
			(b.side === 'from' ? f : t)[b.index] = remainder;
			filled = b;
		}
	} else if (blanks.length > 1) errors.push('Leave at most one amount blank (it gets the remainder)');

	const fromTotal = sum(f);
	const toTotal = sum(t);
	if (fromTotal !== toTotal && blanks.length <= 1)
		errors.push(`From and To differ by ${Math.abs(fromTotal - toTotal) / 100}`);

	const ids = new Set(from.map((l) => l.accountId).filter(Boolean));
	for (const l of to) if (l.accountId && ids.has(l.accountId)) errors.push('Same Account on both sides');

	const entries: Entry[] = [
		...from.map((l, i) => ({ accountId: l.accountId, amount: -(f[i] ?? 0) })),
		...to.map((l, i) => ({ accountId: l.accountId, amount: t[i] ?? 0 }))
	];
	const kind = kindOf(
		from.map((l) => typeOf(l.accountId)).filter((x) => x !== undefined),
		to.map((l) => typeOf(l.accountId)).filter((x) => x !== undefined)
	);
	return { from: f, to: t, filled, fromTotal, toTotal, errors: [...new Set(errors)], entries, kind };
}

export const centsToText = (c: number) => (c / 100).toFixed(2);
export const blank = (): Line => ({ accountId: '', amount: '' });
