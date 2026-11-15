// Credit Card Statements (ADR 0006): derived from the card's Statement Day and Due Day and its
// Transactions, never stored. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import { rowStatuses } from './installments.ts';
import { addDays, occurrencesOf } from './scheduled.ts';
import {
	statementId,
	type CardTerms,
	type Installment,
	type PaidLink,
	type Scheduled,
	type Statement,
	type Transaction
} from './schemas.ts';
import type { ChartWrite } from './writes.ts';

export type StatementInput = {
	chart: Chart;
	scheduled: Scheduled[];
	installments: Installment[];
	/** Stored per-Statement values: the entered amount and Paying sources. */
	statements: Statement[];
};

/** One charge (positive) or refund billed in a Statement. */
export type BilledItem = {
	key: string;
	label: string;
	/** The day it bills as: `billOn` for a recorded charge billed later, else its own date. */
	date: IsoDate;
	/** Positive centavos. */
	amount: number;
	/** A recorded Transaction, or a planned Occurrence or Row not recorded yet. */
	from: 'transaction' | 'scheduled' | 'installment';
	txId?: string;
	link?: PaidLink;
};

export type CardStatement = {
	/** The first day billed in it: the day after the previous Statement Date. */
	from: IsoDate;
	statementDate: IsoDate;
	dueDate: IsoDate;
	charges: BilledItem[];
	/** Money back onto the card from an Expense or Income Account: not a payment. */
	refunds: BilledItem[];
	/** The Opening Balance, carried into the first Statement only. */
	carried: number;
	/** Carried + charges − refunds. */
	computed: number;
	/** The amount the owner entered from the real Statement; null while estimated. */
	entered: number | null;
	/** What the Statement asks for: the entered amount, else the computed one. */
	balance: number;
	/** Entered − computed, so a missing charge stands out; null while estimated. */
	gap: number | null;
	/** Payments (and earlier credit) applied to it, oldest Statement first. */
	paid: number;
	/** What is left to pay; 0 once Paid or when nothing is owed. */
	remaining: number;
	status: 'unpaid' | 'partly-paid' | 'paid';
};

// Plain calendar arithmetic on `YYYY-MM-DD`, in UTC so no timezone shifts a day.
const parts = (d: IsoDate) => d.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) =>
	`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Day `day` of month `m` (1–12, may overflow either way), clamped to the month's last day. */
function dayOf(y: number, m: number, day: number): IsoDate {
	const year = y + Math.floor((m - 1) / 12);
	const month = ((((m - 1) % 12) + 12) % 12) + 1;
	return iso(year, month, Math.min(day, daysIn(year, month)));
}

/** The Statement Date of the Statement that bills `date`: on or after it. */
function statementDateFor(terms: CardTerms, date: IsoDate): IsoDate {
	const [y, m] = parts(date);
	const here = dayOf(y, m, terms.statementDay);
	return date <= here ? here : dayOf(y, m + 1, terms.statementDay);
}

const nextStatementDate = (terms: CardTerms, statementDate: IsoDate): IsoDate => {
	const [y, m] = parts(statementDate);
	return dayOf(y, m + 1, terms.statementDay);
};

const previousStatementDate = (terms: CardTerms, statementDate: IsoDate): IsoDate => {
	const [y, m] = parts(statementDate);
	return dayOf(y, m - 1, terms.statementDay);
};

function dueDateOf(terms: CardTerms, statementDate: IsoDate): IsoDate {
	const [y, m] = parts(statementDate);
	return terms.dueDay > terms.statementDay
		? dayOf(y, m, terms.dueDay)
		: dayOf(y, m + 1, terms.dueDay);
}

function addDay(d: IsoDate): IsoDate {
	const [y, m, day] = parts(d);
	const t = new Date(Date.UTC(y, m - 1, day + 1));
	return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** The card's net change in display sign (owed up positive). */
const onCard = (tx: Transaction, cardId: string) =>
	-tx.entries.filter((e) => e.accountId === cardId).reduce((sum, e) => sum + e.amount, 0);

/** A payment moves money from an Asset into the card. */
const isPayment = (chart: Chart, tx: Transaction) =>
	tx.entries.some((e) => e.amount < 0 && chart.account(e.accountId)?.type === 'asset');

const sum = (items: BilledItem[]) => items.reduce((total, i) => total + i.amount, 0);

const keyOf = (l: PaidLink) => `${l.plan}:${l.planId}:${l.due}`;

/**
 * Occurrences and Installment Rows charged to the card and not recorded yet, from the Statement
 * open today on: a closed Statement is what was recorded (and its real amount can be entered).
 */
function plannedCharges(
	input: StatementInput,
	cardId: string,
	terms: CardTerms,
	{ until, today }: { until: IsoDate; today: IsoDate }
): BilledItem[] {
	const { chart } = input;
	const range = {
		from: addDay(previousStatementDate(terms, statementDateFor(terms, today))),
		to: until
	};
	// What recorded Transactions already charged to the card for each planned item.
	const recorded = new Map<string, number>();
	for (const tx of chart.transactionsFor(cardId))
		if (tx.date !== null && tx.pays)
			recorded.set(keyOf(tx.pays), (recorded.get(keyOf(tx.pays)) ?? 0) + onCard(tx, cardId));

	const planned: BilledItem[] = [];
	for (const plan of input.scheduled)
		for (const occ of occurrencesOf(plan, range)) {
			if (occ.skipped || occ.settled) continue;
			const lines = occ.version.lines;
			const k = lines.findIndex((l) => l.side === 'from' && l.accountId === cardId);
			const fromAsset = lines.some(
				(l) => l.side === 'from' && chart.account(l.accountId)?.type === 'asset'
			);
			if (k < 0 || fromAsset) continue;
			const link: PaidLink = { plan: 'scheduled', planId: plan.id, due: occ.due };
			const amount = (occ.amounts[k] ?? occ.total ?? 0) - (recorded.get(keyOf(link)) ?? 0);
			if (amount > 0)
				planned.push({
					key: keyOf(link),
					label: occ.version.description,
					date: occ.date,
					amount,
					from: 'scheduled',
					link
				});
		}
	for (const plan of input.installments) {
		if (plan.accounts.paying !== cardId) continue;
		const last = plan.rows.at(-1)!.n;
		for (const row of rowStatuses(chart, plan, { today })) {
			const { date, due, n } = row.row;
			if (row.state === 'paid' || row.state === 'before' || row.remaining <= 0) continue;
			if (date < range.from || date > range.to) continue;
			const link: PaidLink = { plan: 'installment', planId: plan.id, due };
			planned.push({
				key: keyOf(link),
				label: `[Ins ${n}/${last}] ${plan.title}`,
				date,
				amount: row.remaining,
				from: 'installment',
				link
			});
		}
	}
	return planned;
}

/**
 * Every Statement of a Credit Card from the first one with anything billed, through the last
 * whose Due Date is on or before `until`, oldest first.
 */
export function statementsOf(
	input: StatementInput,
	cardId: string,
	{ until, today }: { until: IsoDate; today: IsoDate }
): CardStatement[] {
	const { chart } = input;
	const terms = chart.account(cardId)?.card;
	if (!terms) return [];

	const items: BilledItem[] = [];
	const refunds: BilledItem[] = [];
	// Payments fill the oldest Statement first, whatever their date (ADR 0006).
	let pool = 0;
	let carried = 0;
	for (const tx of chart.transactionsFor(cardId)) {
		const net = onCard(tx, cardId);
		if (tx.date === null) {
			carried += net;
			continue;
		}
		if (net < 0 && isPayment(chart, tx)) pool += -net;
		if (net < 0 && !isPayment(chart, tx))
			refunds.push({
				key: `transaction:${tx.id}`,
				label: tx.description,
				date: tx.billOn ?? tx.date,
				amount: -net,
				from: 'transaction',
				txId: tx.id
			});
		if (net > 0)
			items.push({
				key: `transaction:${tx.id}`,
				label: tx.description,
				date: tx.billOn ?? tx.date,
				amount: net,
				from: 'transaction',
				txId: tx.id
			});
	}
	items.push(...plannedCharges(input, cardId, terms, { until, today }));
	items.sort((a, b) => a.date.localeCompare(b.date));
	const dated = [...items, ...refunds];
	if (dated.length === 0 && carried === 0) return [];

	// The first Statement bills the earliest dated item; with only an Opening Balance, today.
	const first = dated.length
		? dated.reduce((min, i) => (i.date < min ? i.date : min), dated[0].date)
		: today;
	const entries = new Map(
		input.statements.filter((s) => s.cardId === cardId).map((s) => [s.statementDate, s.amount])
	);
	const statements: CardStatement[] = [];
	for (
		let statementDate = statementDateFor(terms, first);
		dueDateOf(terms, statementDate) <= until;
		statementDate = nextStatementDate(terms, statementDate)
	) {
		const from = addDay(previousStatementDate(terms, statementDate));
		const billed = (i: BilledItem) => i.date >= from && i.date <= statementDate;
		const charges = items.filter(billed);
		const credits = refunds.filter(billed);
		const opening = statements.length === 0 ? carried : 0;
		const computed = opening + sum(charges) - sum(credits);
		const entered = entries.get(statementDate) ?? null;
		const balance = entered ?? computed;
		// A negative balance is credit for the next Statement, like a payment.
		const paid = balance > 0 ? Math.min(pool, balance) : 0;
		pool += balance > 0 ? -paid : -balance;
		const remaining = Math.max(0, balance - paid);
		statements.push({
			from,
			statementDate,
			dueDate: dueDateOf(terms, statementDate),
			charges,
			refunds: credits,
			carried: opening,
			computed,
			entered,
			balance,
			gap: entered === null ? null : entered - computed,
			paid,
			remaining,
			status: remaining === 0 ? 'paid' : paid > 0 ? 'partly-paid' : 'unpaid'
		});
	}
	return statements;
}

/** Enters (or with null, clears) the amount a real Statement shows; Paying sources stay. */
export function planSetStatementAmount(
	stored: Statement[],
	cardId: string,
	statementDate: IsoDate,
	amount: number | null,
	{ now }: { now: Date }
): ChartWrite[] {
	const prior = stored.find((s) => s.cardId === cardId && s.statementDate === statementDate);
	return [
		{
			op: 'setStatement',
			id: statementId(cardId, statementDate),
			data: {
				amount,
				sources: prior?.sources ?? [],
				createdAt: prior?.createdAt ?? now,
				updatedAt: now
			}
		}
	];
}

/** The first Due Date on or after `today`. */
export function nextDueDate(terms: CardTerms, today: IsoDate): IsoDate {
	const open = statementDateFor(terms, today);
	const closed = dueDateOf(terms, previousStatementDate(terms, open));
	return closed >= today ? closed : dueDateOf(terms, open);
}

/** A Scheduled Transaction that still plans paying the card, and the day to end it on. */
export type CardPaymentPlan = { plan: Scheduled; endOn: IsoDate };

/**
 * Scheduled Transactions that still pay the card from an Asset on or after its next Due Date.
 * Once the card has its days, its Statements plan those payments, so these would plan them twice.
 */
export function cardPaymentPlans(
	input: Pick<StatementInput, 'chart' | 'scheduled'>,
	cardId: string,
	terms: CardTerms,
	{ today }: { today: IsoDate }
): CardPaymentPlan[] {
	const { chart } = input;
	const due = nextDueDate(terms, today);
	const range = { from: due, to: addDays(due, 400) };
	return input.scheduled.flatMap((plan) => {
		const pays = occurrencesOf(plan, range).some(
			({ skipped, version: { lines } }) =>
				!skipped &&
				lines.some((l) => l.side === 'to' && !l.fee && l.accountId === cardId) &&
				lines.some((l) => l.side === 'from' && chart.account(l.accountId)?.type === 'asset')
		);
		return pays ? [{ plan, endOn: addDays(due, -1) }] : [];
	});
}

/** Ends each plan the day before the card's next Due Date; earlier Occurrences and links stay. */
export function planEndCardPaymentPlans(
	found: CardPaymentPlan[],
	{ now }: { now: Date }
): ChartWrite[] {
	return found.map(({ plan: { id, ...data }, endOn }) => ({
		op: 'setScheduled',
		id,
		data: { ...data, end: { type: 'on', date: endOn }, updatedAt: now }
	}));
}
