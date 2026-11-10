// Creating an Installment Plan: the create form's preview and checks, the writes that create the
// plan with its Accounts, and the optional take-on prefills. Pure TypeScript, no Firebase imports.
import { buildChart, type Chart, type IsoDate } from './chart.ts';
import { inheritsMoney, planCreateAccount } from './create-account.ts';
import { datesOf, flatRows, planSaveInstallment, rowAdditionals } from './installments.ts';
import { parseAmount } from './money.ts';
import type {
	Additional,
	Installment,
	InstallmentRow,
	RepeatRule,
	Transaction
} from './schemas.ts';
import { normalizeTags, type DraftError, type TransactionDraft } from './transactions.ts';
import type { ChartWrite } from './writes.ts';

export type RowDraft = { principal: string; interest: string };
export type AdditionalDraft = { description: string; amount: string };

/** What the create form holds. Amounts are raw text. */
export type InstallmentDraft = {
	kind: 'lender' | 'internal';
	title: string;
	note: string;
	tags: string[];
	purchaseDate: IsoDate;
	/** The first row's date: row 0 when `rowZero`, otherwise row 1. */
	firstDate: IsoDate;
	repeat: 'monthly' | 'cutoff' | 'weekly';
	everyWeeks: number;
	/** Rows from 1; row 0 comes on top when `rowZero`. */
	count: number;
	rowZero: boolean;
	entry: 'flat' | 'varied';
	/** Flat: the principal to split and the interest on every row. */
	amount: string;
	interest: string;
	/** Varied: one per row, in row order (row 0 first when present). */
	varied: RowDraft[];
	/** By row number. */
	additionals: Record<number, AdditionalDraft[]>;
	/** Null until the user picks one: the default applies. */
	trackedFrom: number | null;
	liability:
		| { mode: 'new'; parentId: string; name: string; historyName: string }
		| { mode: 'pick'; accountId: string };
	/** In progress, card plan: the card's Opening Balance already includes what is left. */
	inCardBalance: boolean;
	repaidAssetId: string;
	payingId: string;
	/** '' means Expenses › Finance charges, made or reused. */
	interestId: string;
	feesId: string;
	/** The Transaction this plan is made from, when started from one. */
	madeFrom?: string;
	/** The owner's Forecast Section; none (or null) means the derived default. */
	section?: string | null;
};

export type EvaluatedInstallment = {
	rule: RepeatRule | null;
	rows: InstallmentRow[];
	/** The first payment is before today: rows may already be paid (Before tracking). */
	inProgress: boolean;
	trackedFrom: number;
	/** Principal of tracked rows: the new Liability's Opening Balance when in progress. */
	trackedPrincipal: number;
	/** The chosen parent is a Leaf with money, so it is split into history + plan Leaf. */
	parentHoldsMoney: boolean;
	/** Sums over every previewed row; `grand` is what all rows cost together. */
	totals: { principal: number; interest: number; additionals: number; grand: number };
	errors: DraftError[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function ruleOf(d: InstallmentDraft): RepeatRule | null {
	if (!ISO_DATE.test(d.firstDate)) return null;
	if (d.repeat === 'cutoff') return { type: 'cutoff', start: d.firstDate };
	if (d.repeat === 'weekly') return { type: 'weekly', every: d.everyWeeks, start: d.firstDate };
	return { type: 'monthly', day: Number(d.firstDate.slice(8)), start: d.firstDate };
}

/** The create form's preview and checks. `startedOn` is when the owner started Perancial. */
export function evaluateInstallmentDraft(
	chart: Chart,
	plans: Installment[],
	d: InstallmentDraft,
	{ today, startedOn }: { today: IsoDate; startedOn: IsoDate }
): EvaluatedInstallment {
	const errors: DraftError[] = [];
	const fail = (at: string, message: string) => errors.push({ at, message });
	const cents = (text: string, at: string, { blank = 0 } = {}): number => {
		if (text.trim() === '') return blank;
		const c = parseAmount(text);
		if (c === null || c < 0) {
			fail(at, 'Enter an amount like 1,234.50');
			return 0;
		}
		return c;
	};

	// Terms.
	const title = d.title.trim();
	if (!title) fail('title', 'Add a title');
	else if (title.length > 200) fail('title', 'At most 200 characters');
	if (!ISO_DATE.test(d.purchaseDate)) fail('purchaseDate', 'Choose the purchase date');
	const rule = ruleOf(d);
	if (!rule) fail('firstDate', 'Choose the first payment date');
	if (!Number.isInteger(d.count) || d.count < 1 || d.count > 599)
		fail('count', 'Enter between 1 and 599 payments');
	if (d.repeat === 'weekly' && !(d.everyWeeks >= 1 && d.everyWeeks <= 52))
		fail('repeat', 'Repeat every 1 to 52 weeks');
	if (normalizeTags(d.tags).length > 50) fail('tags', 'At most 50 tags');

	// Rows.
	let rows: InstallmentRow[] = [];
	if (rule && !errors.some((e) => e.at === 'count' || e.at === 'repeat')) {
		if (d.entry === 'flat') {
			const amount = cents(d.amount, 'amount', { blank: -1 });
			if (amount === -1) fail('amount', 'Enter the amount owed');
			else if (amount === 0 && !errors.some((e) => e.at === 'amount'))
				fail('amount', 'Enter the amount owed');
			const interest = cents(d.interest, 'interest');
			rows = flatRows({
				amount: Math.max(amount, 0),
				count: d.count,
				interest,
				rule,
				rowZero: d.rowZero
			});
		} else {
			const dates = datesOf(rule, d.count + (d.rowZero ? 1 : 0));
			rows = dates.map((date, i) => {
				const typed = d.varied[i] ?? { principal: '', interest: '' };
				return {
					n: d.rowZero ? i : i + 1,
					due: date,
					date,
					principal: cents(typed.principal, `rows.${i}.principal`),
					interest: cents(typed.interest, `rows.${i}.interest`),
					additionals: []
				};
			});
			if (!errors.length && !rows.some((r) => r.principal > 0))
				fail('rows', 'Enter the principal of each row');
		}
		rows = rows.map((r) => {
			const typed = d.additionals[r.n] ?? [];
			const additionals: Additional[] = typed.flatMap((a, k) => {
				const amount = parseAmount(a.amount);
				if (!a.description.trim() || amount === null || amount <= 0) {
					fail(`additionals.${r.n}.${k}`, 'Describe each additional and give it an amount');
					return [];
				}
				return [{ description: a.description.trim(), amount }];
			});
			return { ...r, additionals };
		});
	}

	// Tracking.
	const inProgress = !!rule && d.firstDate < today;
	const first = rows[0]?.n ?? 1;
	const fallback = rows.find((r) => r.date >= startedOn)?.n ?? first;
	const trackedFrom = !inProgress
		? first
		: d.trackedFrom !== null && rows.some((r) => r.n === d.trackedFrom)
			? d.trackedFrom
			: fallback;
	const trackedPrincipal = rows
		.filter((r) => r.n >= trackedFrom)
		.reduce((s, r) => s + r.principal, 0);

	// Accounts.
	const leafOf = (id: string, type: string) => {
		const a = chart.account(id);
		return !!a && a.type === type && !a.system && !a.archived && !chart.isGroup(id);
	};
	let parentHoldsMoney = false;
	if (d.kind === 'lender') {
		const l = d.liability;
		if (l.mode === 'pick') {
			const other = plans.find((p) => p.kind === 'lender' && p.accounts.repaid === l.accountId);
			if (!leafOf(l.accountId, 'liability')) fail('liability', 'Choose a Liability Leaf Account');
			else if (other) fail('liability', `That Liability already holds "${other.title}"`);
		} else {
			const parent = chart.account(l.parentId);
			parentHoldsMoney = !!parent && inheritsMoney(chart, l.parentId);
			if (!parent || parent.type !== 'liability' || parent.system === 'opening-balances')
				fail('liability', 'Choose where under Liabilities the new Account goes');
			else if (!l.name.trim()) fail('liability', 'Name the new Liability Account');
			else if (parentHoldsMoney && !l.historyName.trim())
				fail('liability', `Name the Account that keeps "${parent.name}"'s history`);
		}
		for (const [field, id] of [
			['interest', d.interestId],
			['fees', d.feesId]
		] as const)
			if (id && !leafOf(id, 'expense')) fail(field, 'Choose an Expense Leaf Account');
	} else if (!leafOf(d.repaidAssetId, 'asset')) fail('repaid', 'Choose the Asset this plan repays');
	const paying = chart.account(d.payingId);
	if (!paying || paying.system || paying.archived || chart.isGroup(d.payingId))
		fail('paying', 'Choose the Account the rows are paid from');

	const sum = (f: (r: InstallmentRow) => number) => rows.reduce((s, r) => s + f(r), 0);
	const totals = {
		principal: sum((r) => r.principal),
		interest: sum((r) => r.interest),
		additionals: sum(rowAdditionals)
	};
	return {
		rule,
		rows,
		inProgress,
		trackedFrom,
		trackedPrincipal,
		parentHoldsMoney,
		totals: { ...totals, grand: totals.principal + totals.interest + totals.additionals },
		errors
	};
}

const FINANCE_CHARGES = 'Finance charges';

/** The chart as it will be once these Account writes land (for checking later writes). */
function withAccounts(chart: Chart, writes: ChartWrite[]): Chart {
	const accounts = new Map(chart.all().map((a) => [a.id, a]));
	for (const w of writes) if (w.op === 'setAccount') accounts.set(w.id, { id: w.id, ...w.data });
	return buildChart([...accounts.values()], chart.transactions());
}

/**
 * Every write that creates the plan, atomically: the new Liability Leaf (splitting a parent Leaf
 * that holds money, so its history keeps its ID beside the plan's Leaf), its Opening Balance when
 * the plan is in progress and not already in the card's balance, Expenses › Finance charges when
 * needed, and the plan itself. Throws the first error when the draft has any.
 */
export function planCreateInstallmentFromDraft(
	chart: Chart,
	plans: Installment[],
	d: InstallmentDraft,
	{
		today,
		startedOn,
		now,
		planId,
		newId
	}: { today: IsoDate; startedOn: IsoDate; now: Date; planId: string; newId: () => string }
): { writes: ChartWrite[]; planId: string; liabilityId: string | null; historyId: string | null } {
	const ev = evaluateInstallmentDraft(chart, plans, d, { today, startedOn });
	if (ev.errors.length) throw new Error(ev.errors[0].message);
	const writes: ChartWrite[] = [];
	let c = chart;
	const add = (ws: ChartWrite[]) => {
		writes.push(...ws);
		c = withAccounts(c, ws);
	};

	let repaid = d.repaidAssetId;
	let liabilityId: string | null = null;
	let historyId: string | null = null;
	if (d.kind === 'lender') {
		const l = d.liability;
		if (l.mode === 'pick') repaid = l.accountId;
		else {
			let parentId = l.parentId;
			if (ev.parentHoldsMoney) {
				// ADR 0002: the card Leaf becomes the history child and a new Group takes its place.
				const split = planCreateAccount(
					c,
					{
						parentId,
						name: l.historyName.trim(),
						description: '',
						openingBalance: 0,
						children: []
					},
					{ newId, now }
				);
				historyId = parentId;
				parentId = split.find((w) => w.op === 'setAccount' && w.id !== historyId)!.id;
				add(split);
			}
			const opening = ev.inProgress && !d.inCardBalance ? ev.trackedPrincipal : 0;
			const leaf = planCreateAccount(
				c,
				{ parentId, name: l.name.trim(), description: '', openingBalance: opening, children: [] },
				{ newId, now }
			);
			repaid = leaf[0].id;
			add(leaf);
		}
		liabilityId = repaid;
	}

	let finance: string | null = null;
	const financeId = () => {
		if (finance) return finance;
		const existing = c
			.all()
			.find(
				(a) => a.type === 'expense' && a.name === FINANCE_CHARGES && !a.archived && !c.isGroup(a.id)
			);
		if (existing) return (finance = existing.id);
		const root = c.all().find((a) => a.type === 'expense' && a.system === 'root')!;
		const ws = planCreateAccount(
			c,
			{
				parentId: root.id,
				name: FINANCE_CHARGES,
				description: '',
				openingBalance: 0,
				children: []
			},
			{ newId, now }
		);
		add(ws);
		return (finance = ws[0].id);
	};
	const accounts =
		d.kind === 'lender'
			? {
					repaid,
					paying: d.payingId,
					interest: d.interestId || financeId(),
					fees: d.feesId || financeId()
				}
			: { repaid, paying: d.payingId, interest: null, fees: null };

	writes.push(
		...planSaveInstallment(
			c,
			plans,
			planId,
			{
				kind: d.kind,
				title: d.title.trim(),
				note: d.note,
				tags: normalizeTags(d.tags),
				purchaseDate: d.purchaseDate,
				entry: d.entry,
				rule: ev.rule!,
				trackedFrom: ev.trackedFrom,
				accounts,
				rows: ev.rows,
				...(d.madeFrom ? { madeFrom: d.madeFrom } : {}),
				...(d.section ? { section: d.section } : {})
			},
			{ now }
		)
	);
	return { writes, planId, liabilityId, historyId };
}

/** The same day one month later, or the month's last day when it is shorter. */
function nextMonth(d: IsoDate): IsoDate {
	const [y, m, day] = [+d.slice(0, 4), +d.slice(5, 7), +d.slice(8, 10)];
	const [ny, nm] = m === 12 ? [y + 1, 1] : [y, m + 1];
	const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${ny}-${p(nm)}-${p(Math.min(day, last))}`;
}

/**
 * The create form started from a Transaction. Its From Account picks the kind: an Asset gives an
 * Internal Installment Plan repaying it; a Liability (a card) gives a lender plan whose new
 * Liability goes under the card and is paid from it. Title, tags, purchase date and principal come
 * from the Transaction; the first row is a month after it.
 */
export function installmentDraftFromTransaction(
	chart: Chart,
	tx: Transaction,
	base: InstallmentDraft
): InstallmentDraft {
	const fromId = tx.entries.find((e) => e.amount < 0 && !e.fee)?.accountId ?? '';
	const fromType = chart.account(fromId)?.type;
	const principal = tx.entries
		.filter((e) => e.amount > 0 && !e.fee)
		.reduce((s, e) => s + e.amount, 0);
	const d: InstallmentDraft = {
		...structuredClone(base),
		title: tx.description,
		tags: [...tx.tags],
		purchaseDate: tx.date!,
		firstDate: nextMonth(tx.date!),
		amount: amountText(principal),
		madeFrom: tx.id
	};
	if (fromType === 'asset') return { ...d, kind: 'internal', repaidAssetId: fromId, payingId: '' };
	if (fromType === 'liability')
		return {
			...d,
			kind: 'lender',
			liability: {
				mode: 'new',
				parentId: fromId,
				name: tx.description,
				historyName: 'Card spending'
			},
			payingId: fromId
		};
	return d;
}

/** The plan made from this Transaction, if any. */
export const planMadeFrom = (plans: Installment[], txId: string) =>
	plans.find((p) => p.madeFrom === txId);

/** The take-on Transactions the app offers after saving a plan. All optional and never linked. */
export type TakeOn = 'purchase' | 'move-debt' | 'card-payment';

const amountText = (cents: number) =>
	`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/**
 * A prefilled Transaction form for taking on a plan:
 * - `purchase`: the whole principal leaves the plan's Liability, dated the purchase date; the user
 *   picks the Expense or Asset it bought.
 * - `move-debt`: what is still owed moves from the plan's Liability onto the card (`to`), today,
 *   for a plan already counted in the card's balance.
 * - `card-payment`: an Internal Installment Plan's straight card payment out of the repaid Asset.
 */
export function takeOnDraft(
	plan: Installment,
	variant: TakeOn,
	{ today, to = '' }: { today: IsoDate; to?: string }
): TransactionDraft {
	const principal = (rows: InstallmentRow[]) => rows.reduce((s, r) => s + r.principal, 0);
	const tracked = principal(plan.rows.filter((r) => r.n >= plan.trackedFrom));
	const base = { note: '', status: 'cleared' as const, tags: [...plan.tags], fees: [] };
	const from = (amount: number) => [
		{ accountId: plan.accounts.repaid, amount: amountText(amount) }
	];
	if (variant === 'move-debt')
		return {
			...base,
			date: today,
			description: `${plan.title}: moved from the card`,
			from: from(tracked),
			to: [{ accountId: to, amount: '' }]
		};
	return {
		...base,
		date: plan.purchaseDate,
		description: variant === 'purchase' ? plan.title : `${plan.title}: card payment`,
		from: from(principal(plan.rows)),
		to: [{ accountId: to, amount: '' }]
	};
}
