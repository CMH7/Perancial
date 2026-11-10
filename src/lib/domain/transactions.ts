// Transactions: the derived kind, the form's arithmetic and checks, and the writes for create,
// edit, duplicate, and delete. Pure TypeScript, no Firebase imports.
import { toStorage, type Chart, type IsoDate } from './chart.ts';
import { parseAmount } from './money.ts';
import type { AccountType, Entry, PaidLink, Transaction } from './schemas.ts';
import { clearSettledWithLastPayment, type PayablePlan } from './payable.ts';
import type { ChartWrite } from './writes.ts';

/** Derived from Account Types, never chosen or stored. */
export type TransactionKind = 'expense' | 'income' | 'transfer' | 'income-and-expense';

/**
 * Money reaching an Expense Account makes an Expense (whatever pays: cash, a credit card, a
 * Transfer's fee); money leaving an Income Account makes Income; anything else is a Transfer.
 */
export function kindOf(
	chart: Chart,
	entries: Pick<Entry, 'accountId' | 'amount'>[]
): TransactionKind {
	const type = (id: string) => chart.account(id)?.type;
	const expense = entries.some((e) => e.amount > 0 && type(e.accountId) === 'expense');
	const income = entries.some((e) => e.amount < 0 && type(e.accountId) === 'income');
	if (expense && income) return 'income-and-expense';
	if (expense) return 'expense';
	if (income) return 'income';
	return 'transfer';
}

/** Lowercase letters, digits and hyphens; spaces become hyphens, anything else is dropped. */
export function normalizeTag(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/** Normalised, without empty or repeated tags, in first-seen order. */
export function normalizeTags(tags: string[]): string[] {
	return [...new Set(tags.map(normalizeTag).filter(Boolean))];
}

/** A From or To line as typed: the amount is raw text, blank meaning "fill with what's left". */
export type DraftLine = { accountId: string; amount: string };
/** A Fees-section line: added on top of what leaves From, or taken out of what arrives at To. */
export type DraftFee = DraftLine & { mode: 'additional' | 'less' };
export type LineSide = 'from' | 'to' | 'fees';

/** What the Transaction form holds. */
export type TransactionDraft = {
	date: IsoDate;
	description: string;
	note: string;
	status: 'cleared' | 'pending';
	tags: string[];
	from: DraftLine[];
	to: DraftLine[];
	fees: DraftFee[];
};

/**
 * Where an error belongs: `date`, `description`, `note`, `total`, or a line's
 * `${side}.${index}.account` / `${side}.${index}.amount`.
 */
export type DraftError = { at: string; message: string };

export type EvaluatedDraft = {
	/** Parsed centavos per line (null when blank or unreadable), with the filled line included. */
	amounts: Record<LineSide, (number | null)[]>;
	/** The one blank amount, filled with what balances the Transaction. */
	filled: { side: LineSide; index: number; amount: number } | null;
	fromTotal: number;
	/** To lines plus fees. */
	toTotal: number;
	/** What the From lines still have to cover: `toTotal − fromTotal`. Negative when From is more. */
	uncovered: number;
	kind: TransactionKind | null;
	/** Storage-sign Entries in form order: From (negative), To, then fees (positive). */
	entries: Entry[];
	errors: DraftError[];
};

const OPENING_BALANCES = 'opening-balances';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The form's arithmetic and checks. `existing` is the Transaction being edited: its Accounts stay
 * allowed even once archived.
 */
export function evaluateDraft(
	chart: Chart,
	draft: TransactionDraft,
	{ today, existing }: { today: IsoDate; existing?: Transaction }
): EvaluatedDraft {
	const errors: DraftError[] = [];
	const fail = (at: string, message: string) => errors.push({ at, message });
	const kept = new Set(existing?.entries.map((e) => e.accountId));
	const sides: [LineSide, DraftLine[]][] = [
		['from', draft.from],
		['to', draft.to],
		['fees', draft.fees]
	];

	// Amounts: parse each, then fill the single blank one with the remainder.
	const amounts = {} as Record<LineSide, (number | null)[]>;
	const blanks: { side: LineSide; index: number }[] = [];
	for (const [side, lines] of sides)
		amounts[side] = lines.map((line, index) => {
			if (line.amount.trim() === '') {
				blanks.push({ side, index });
				return null;
			}
			const cents = parseAmount(line.amount);
			if (cents === null) fail(`${side}.${index}.amount`, 'Enter an amount like 1,234.50');
			else if (cents <= 0) fail(`${side}.${index}.amount`, 'Amounts are more than zero');
			return cents !== null && cents > 0 ? cents : null;
		});
	const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

	let filled: EvaluatedDraft['filled'] = null;
	if (blanks.length > 1) fail('total', 'Leave at most one amount blank: it gets what is left');
	else if (blanks.length === 1) {
		const { side, index } = blanks[0];
		const toSide = sum(amounts.to) + sum(amounts.fees);
		const remainder = side === 'from' ? toSide - sum(amounts.from) : sum(amounts.from) - toSide;
		if (remainder > 0) {
			amounts[side][index] = remainder;
			filled = { side, index, amount: remainder };
		} else fail(`${side}.${index}.amount`, 'Nothing is left to fill this amount');
	}
	const fromTotal = sum(amounts.from);
	const toTotal = sum(amounts.to) + sum(amounts.fees);
	const amountErrors = errors.some((e) => e.at.endsWith('.amount') || e.at === 'total');
	if (!amountErrors && fromTotal !== toTotal)
		fail('total', 'From and To must add up to the same amount');

	// Accounts.
	errors.push(...lineAccountErrors(chart, draft, kept));

	// Fields.
	if (!ISO_DATE.test(draft.date)) fail('date', 'Choose a date');
	else if (draft.date > today) fail('date', 'Record it on the day, or use a Scheduled Transaction');
	const description = draft.description.trim();
	if (!description) fail('description', 'Add a Description');
	else if (description.length > 200) fail('description', 'At most 200 characters');
	if (draft.note.length > 5000) fail('note', 'At most 5,000 characters');
	if (normalizeTags(draft.tags).length > 50) fail('tags', 'At most 50 tags');

	const entries: Entry[] = [
		...draft.from.map((l, i) => ({ accountId: l.accountId, amount: -(amounts.from[i] ?? 0) })),
		...draft.to.map((l, i) => ({ accountId: l.accountId, amount: amounts.to[i] ?? 0 })),
		...draft.fees.map((l, i) => ({
			accountId: l.accountId,
			amount: amounts.fees[i] ?? 0,
			fee: l.mode
		}))
	];
	const known = entries.filter((e) => chart.account(e.accountId));
	const kind =
		known.some((e) => e.amount < 0) && known.some((e) => e.amount > 0)
			? kindOf(chart, known)
			: null;
	return {
		amounts,
		filled,
		fromTotal,
		toTotal,
		uncovered: toTotal - fromTotal,
		kind,
		entries,
		errors
	};
}

/** A Leaf Account the form offers: its full path below the Root Account, and its Balance. */
export type AccountChoice = { id: string; label: string; balance: number };

/**
 * The Leaf Accounts of one Account Type a line can use, sorted by path, each with its Balance as
 * of `today` (display sign, Pending counts). System Accounts never; Archived ones only when `kept`.
 */
export function accountChoices(
	chart: Chart,
	type: AccountType,
	{ today, kept = new Set() }: { today: IsoDate; kept?: ReadonlySet<string> }
): AccountChoice[] {
	return chart
		.all()
		.filter(
			(a) => a.type === type && !a.system && !chart.isGroup(a.id) && (!a.archived || kept.has(a.id))
		)
		.map((a) => ({
			id: a.id,
			label:
				chart
					.path(a.id)
					.slice(1)
					.map((p) => p.name)
					.join(' › ') + (a.archived ? ' (archived)' : ''),
			balance: chart.balance(a.id, today)
		}))
		.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Each line's Account must be a chosen, non-system Leaf Account, not archived unless `kept`;
 * fees go to Expense Accounts; no Account is on both sides. Shared with the plan editor.
 */
export function lineAccountErrors(
	chart: Chart,
	lines: Pick<TransactionDraft, 'from' | 'to' | 'fees'>,
	kept: ReadonlySet<string> = new Set()
): DraftError[] {
	const errors: DraftError[] = [];
	const fail = (at: string, message: string) => errors.push({ at, message });
	const fromIds = new Set(lines.from.map((l) => l.accountId).filter(Boolean));
	const sides: [LineSide, DraftLine[]][] = [
		['from', lines.from],
		['to', lines.to],
		['fees', lines.fees]
	];
	for (const [side, list] of sides)
		list.forEach((line, index) => {
			const at = `${side}.${index}.account`;
			const account = chart.account(line.accountId);
			if (!line.accountId || !account) fail(at, 'Choose an Account');
			else if (account.id === OPENING_BALANCES || account.system)
				fail(at, 'Opening Balances change from the Account itself');
			else if (chart.isGroup(account.id)) fail(at, 'Choose an Account with no Accounts under it');
			else if (account.archived && !kept.has(account.id))
				fail(at, 'This Account is archived: unarchive it first');
			else if (side === 'fees' && account.type !== 'expense')
				fail(at, 'A fee goes to an Expense Account');
			else if (side !== 'from' && fromIds.has(account.id))
				fail(at, 'The same Account is on both sides');
		});
	return errors;
}

/** Every Entry ever recorded: no Transaction is dated after today, so this is the final Balance. */
const ALL_TIME = '9999-12-31';

/** Refuses a change that leaves an Archived Account it touches holding money. */
function assertArchivedStayEmpty(chart: Chart, before: Entry[], after: Entry[]) {
	const delta = new Map<string, number>();
	for (const e of before) delta.set(e.accountId, (delta.get(e.accountId) ?? 0) - e.amount);
	for (const e of after) delta.set(e.accountId, (delta.get(e.accountId) ?? 0) + e.amount);
	for (const [id, change] of delta) {
		const account = chart.account(id);
		if (!account?.archived || change === 0) continue;
		const stored = toStorage(account.type, chart.balance(id, ALL_TIME));
		if (stored + change !== 0)
			throw new Error(
				`"${account.name}" is archived and would no longer be at zero: unarchive it first`
			);
	}
}

function assertNotOpening(tx: Transaction | undefined) {
	if (tx?.origin === 'opening')
		throw new Error('An Opening Balance changes from its Account, not here');
}

/** The write for a new or edited Transaction. Throws the first error when the draft isn't valid. */
export function planSaveTransaction(
	chart: Chart,
	draft: TransactionDraft,
	{
		id,
		now,
		today,
		existing,
		pays
	}: {
		id: string;
		now: Date;
		today: IsoDate;
		existing?: Transaction;
		/** The occurrence a new Transaction pays (Record); an edit keeps its own link. */
		pays?: PaidLink;
	}
): ChartWrite[] {
	assertNotOpening(existing);
	const ev = evaluateDraft(chart, draft, { today, existing });
	if (ev.errors.length) throw new Error(ev.errors[0].message);
	assertArchivedStayEmpty(chart, existing?.entries ?? [], ev.entries);
	return [
		{
			op: 'setTransaction',
			id,
			data: {
				date: draft.date,
				origin: 'normal',
				description: draft.description.trim(),
				note: draft.note,
				status: draft.status,
				tags: normalizeTags(draft.tags),
				entries: ev.entries,
				accountIds: [...new Set(ev.entries.map((e) => e.accountId))],
				pays: existing ? existing.pays : (pays ?? null),
				billOn: existing?.billOn ?? null,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			}
		}
	];
}

/** Deleting is permanent. Opening Balances and changes that refill an Archived Account are refused. */
export function planDeleteTransaction(
	chart: Chart,
	id: string,
	{ now = new Date(), plans = [] }: { now?: Date; plans?: PayablePlan[] } = {}
): ChartWrite[] {
	const tx = chart.transaction(id);
	if (!tx) throw new Error('This Transaction no longer exists');
	assertNotOpening(tx);
	assertArchivedStayEmpty(chart, tx.entries, []);
	// With `plans`, a "Mark paid" left without any payment is cleared in the same write.
	return [{ op: 'deleteTransaction', id }, ...clearSettledWithLastPayment(chart, tx, plans, now)];
}

/** Centavos as plain text the form can parse back exactly: 501500 → "5015.00". */
const amountText = (cents: number) =>
	`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/** A stored Transaction as the form shows it, fee lines back in the Fees section. */
export function draftFromTransaction(tx: Transaction): TransactionDraft {
	const line = (e: Entry): DraftLine => ({
		accountId: e.accountId,
		amount: amountText(Math.abs(e.amount))
	});
	return {
		date: tx.date ?? '',
		description: tx.description,
		note: tx.note,
		status: tx.status,
		tags: [...tx.tags],
		from: tx.entries.filter((e) => e.amount < 0).map(line),
		to: tx.entries.filter((e) => e.amount > 0 && !e.fee).map(line),
		fees: tx.entries.filter((e) => e.amount > 0 && e.fee).map((e) => ({ ...line(e), mode: e.fee! }))
	};
}

/** Duplicate: everything copied into a new draft dated today and cleared. It is never saved by itself. */
export function duplicateDraft(tx: Transaction, { today }: { today: IsoDate }): TransactionDraft {
	return { ...draftFromTransaction(tx), date: today, status: 'cleared' };
}

/** A blank draft for a new Transaction: dated today, cleared, one From and one To line. */
export function emptyDraft({ today }: { today: IsoDate }): TransactionDraft {
	return {
		date: today,
		description: '',
		note: '',
		status: 'cleared',
		tags: [],
		from: [{ accountId: '', amount: '' }],
		to: [{ accountId: '', amount: '' }],
		fees: []
	};
}
