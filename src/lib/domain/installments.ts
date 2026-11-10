// Installment Plans: schedules with explicit rows (ADR 0004), each row's paid status, the plan's
// totals and statistics, and the edits a plan allows. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import { paidStatus, paymentsFor, planHasPayments, type PaidStatus } from './payable.ts';
import type { Installment, InstallmentDoc, InstallmentRow, RepeatRule } from './schemas.ts';
import type { ChartWrite } from './writes.ts';
import { addDays, ruleDates } from './scheduled.ts';

/** The first `count` dates of a repeat rule. */
function datesOf(rule: RepeatRule, count: number): IsoDate[] {
	const start = rule.type === 'once' ? rule.date : rule.start;
	const out: IsoDate[] = [];
	for (const d of ruleDates(rule, addDays(start, 366 * 60))) {
		out.push(d);
		if (out.length === count) break;
	}
	return out;
}

/**
 * Rows for a flat plan: the amount split evenly, rounded down to the centavo, with the remainder in
 * the last row's principal so the rows add up to the amount exactly. With `rowZero`, an
 * interest/fee-only row 0 takes the first date and the rows from 1 follow.
 */
export function flatRows({
	amount,
	count,
	interest,
	rule,
	rowZero = false
}: {
	amount: number;
	count: number;
	interest: number;
	rule: RepeatRule;
	rowZero?: boolean;
}): InstallmentRow[] {
	const each = Math.floor(amount / count);
	const dates = datesOf(rule, count + (rowZero ? 1 : 0));
	const rows: InstallmentRow[] = Array.from({ length: count }, (_, i) => ({
		n: i + 1,
		due: dates[i + (rowZero ? 1 : 0)],
		date: dates[i + (rowZero ? 1 : 0)],
		principal: i === count - 1 ? amount - each * (count - 1) : each,
		interest,
		additionals: []
	}));
	return rowZero
		? [{ n: 0, due: dates[0], date: dates[0], principal: 0, interest: 0, additionals: [] }, ...rows]
		: rows;
}

/** What a row's additionals add up to. */
export const rowAdditionals = (row: Pick<InstallmentRow, 'additionals'>) =>
	row.additionals.reduce((s, a) => s + a.amount, 0);

/** A row's amount: principal + interest + additionals. */
export const rowTotal = (row: Pick<InstallmentRow, 'principal' | 'interest' | 'additionals'>) =>
	row.principal + row.interest + rowAdditionals(row);

export type RowStatus = {
	row: InstallmentRow;
	total: number;
	/** Before tracking: paid before the plan was tracked, covered by Opening Balances. */
	state: 'before' | 'unpaid' | 'partly-paid' | 'paid';
	overdue: boolean;
	paid: number;
	remaining: number;
	payments: PaidStatus['payments'];
};

/** Every row with its state, in row order. Rows can't be skipped. */
export function rowStatuses(
	chart: Chart,
	plan: Installment,
	{ today }: { today: IsoDate }
): RowStatus[] {
	return plan.rows.map((row) => {
		const total = rowTotal(row);
		if (row.n < plan.trackedFrom)
			return { row, total, state: 'before', overdue: false, paid: 0, remaining: 0, payments: [] };
		const s = paidStatus(
			chart,
			{ plan: 'installment', planId: plan.id, due: row.due },
			{ date: row.date, total, settled: !!row.settled, skipped: false },
			{ today }
		);
		return {
			row,
			total,
			state: s.status === 'skipped' ? 'unpaid' : s.status,
			overdue: s.overdue,
			paid: s.paid,
			remaining: s.remaining ?? 0,
			payments: s.payments
		};
	});
}

export type PlanSummary = {
	/** Σ principal of every row. */
	amount: number;
	/** Σ row amounts, Before tracking included. */
	grandTotal: number;
	/** What is left on tracked rows. */
	balance: number;
	/** Principal of tracked rows not yet Paid: what the plan's Liability should hold. */
	unpaidPrincipal: number;
	/** Paid or Before tracking. */
	doneRows: number;
	rowCount: number;
	/** The first tracked row not yet Paid. */
	next: RowStatus | undefined;
	/** Statistics: scheduled, paid (Paid or Before tracking rows), and paid before tracking. */
	interest: { scheduled: number; paid: number; before: number };
	additionals: { scheduled: number; paid: number; before: number };
};

export function planSummary(
	chart: Chart,
	plan: Installment,
	{ today }: { today: IsoDate }
): PlanSummary {
	const rows = rowStatuses(chart, plan, { today });
	const sum = (list: RowStatus[], f: (r: RowStatus) => number) =>
		list.reduce((s, r) => s + f(r), 0);
	const done = rows.filter((r) => r.state === 'paid' || r.state === 'before');
	const before = rows.filter((r) => r.state === 'before');
	const open = rows.filter((r) => r.state === 'unpaid' || r.state === 'partly-paid');
	const stat = (f: (r: RowStatus) => number) => ({
		scheduled: sum(rows, f),
		paid: sum(done, f),
		before: sum(before, f)
	});
	return {
		amount: sum(rows, (r) => r.row.principal),
		grandTotal: sum(rows, (r) => r.total),
		balance: sum(open, (r) => r.remaining),
		unpaidPrincipal: sum(open, (r) => r.row.principal),
		doneRows: done.length,
		rowCount: rows.length,
		next: open[0],
		interest: stat((r) => r.row.interest),
		additionals: stat((r) => rowAdditionals(r.row))
	};
}

/** A plan's terms and rows: everything but its timestamps. */
export type InstallmentTerms = Omit<InstallmentDoc, 'createdAt' | 'updatedAt'>;

function assertLeaf(chart: Chart, id: string | null, label: string, type?: string) {
	const a = id ? chart.account(id) : undefined;
	if (!a) throw new Error(`Choose the ${label}`);
	if (type && a.type !== type)
		throw new Error(
			`The ${label} must be ${type === 'asset' ? 'an' : 'a'} ${type[0].toUpperCase()}${type.slice(1)} Account`
		);
	if (chart.isGroup(a.id) || a.system) throw new Error(`The ${label} must be a Leaf Account`);
}

/** The bookkeeping checks every save runs (rules only check the shape). */
function assertValid(chart: Chart, plans: Installment[], id: string, plan: InstallmentTerms) {
	const { accounts: acc } = plan;
	if (plan.kind === 'lender') {
		assertLeaf(chart, acc.repaid, "plan's Liability", 'liability');
		assertLeaf(chart, acc.interest, 'Interest Account', 'expense');
		assertLeaf(chart, acc.fees, 'Fees Account', 'expense');
		const other = plans.find(
			(p) => p.id !== id && p.kind === 'lender' && p.accounts.repaid === acc.repaid
		);
		if (other) throw new Error(`That Liability already holds "${other.title}"`);
	} else {
		assertLeaf(chart, acc.repaid, 'repaid Asset', 'asset');
		if (acc.interest || acc.fees)
			throw new Error('An Internal Installment Plan has no Interest or Fees Account');
	}
	assertLeaf(chart, acc.paying, 'paying Account');

	const dues = new Set(plan.rows.map((r) => r.due));
	if (dues.size !== plan.rows.length) throw new Error('Two rows share a due date');
	for (let i = 1; i < plan.rows.length; i++) {
		const [a, b] = [plan.rows[i - 1], plan.rows[i]];
		if (b.n <= a.n || b.date < a.date) throw new Error('Rows must be in number and date order');
	}
	if (!plan.rows.some((r) => r.principal > 0)) throw new Error('A plan needs some principal');

	const before = plans.find((p) => p.id === id);
	for (const row of before?.rows ?? [])
		if (
			!dues.has(row.due) &&
			paymentsFor(chart, { plan: 'installment', planId: id, due: row.due }).length
		)
			throw new Error(`Row ${row.n} has paying Transactions: unlink them first`);
	for (const row of plan.rows)
		if (
			row.settled &&
			!paymentsFor(chart, { plan: 'installment', planId: id, due: row.due }).length
		)
			throw new Error(`Row ${row.n} needs a paying Transaction before it can be marked paid`);
}

/** Creates or replaces a plan after the bookkeeping checks; createdAt is kept on an edit. */
export function planSaveInstallment(
	chart: Chart,
	plans: Installment[],
	id: string,
	plan: InstallmentTerms,
	{ now }: { now: Date }
): ChartWrite[] {
	assertValid(chart, plans, id, plan);
	const createdAt = plans.find((p) => p.id === id)?.createdAt ?? now;
	return [{ op: 'setInstallment', id, data: { ...plan, createdAt, updatedAt: now } }];
}

const termsOf = ({ id: _id, createdAt: _c, updatedAt: _u, ...terms }: Installment) => terms;

function rowIndex(plan: Installment, due: IsoDate): number {
	const i = plan.rows.findIndex((r) => r.due === due);
	if (i < 0) throw new Error('That row is no longer in this plan');
	return i;
}

/** Edits one row (date, principal, interest, additionals); the plan becomes varied. */
export function planEditRow(
	chart: Chart,
	plans: Installment[],
	plan: Installment,
	due: IsoDate,
	patch: Partial<Pick<InstallmentRow, 'date' | 'principal' | 'interest' | 'additionals'>>,
	{ now }: { now: Date }
): ChartWrite[] {
	const i = rowIndex(plan, due);
	const rows = plan.rows.with(i, { ...plan.rows[i], ...patch });
	return planSaveInstallment(
		chart,
		plans,
		plan.id,
		{ ...termsOf(plan), entry: 'varied', rows },
		{ now }
	);
}

/** Adds a row after the last, on the rule's next date, with the last row's principal and interest. */
export function planAddRow(
	chart: Chart,
	plans: Installment[],
	plan: Installment,
	{ now }: { now: Date }
): ChartWrite[] {
	const last = plan.rows.at(-1)!;
	let next: IsoDate | undefined;
	for (const d of ruleDates(plan.rule, addDays(last.due, 400)))
		if (d > last.due) {
			next = d;
			break;
		}
	if (!next) throw new Error("The plan's repeat rule has no date after the last row");
	const row: InstallmentRow = {
		n: last.n + 1,
		due: next,
		date: next,
		principal: last.principal,
		interest: last.interest,
		additionals: []
	};
	return planSaveInstallment(
		chart,
		plans,
		plan.id,
		{ ...termsOf(plan), rows: [...plan.rows, row] },
		{ now }
	);
}

/** Removes the last row, unless Transactions pay it. */
export function planRemoveRow(
	chart: Chart,
	plans: Installment[],
	plan: Installment,
	{ now }: { now: Date }
): ChartWrite[] {
	if (plan.rows.length === 1) throw new Error('A plan needs at least one row');
	const rows = plan.rows.slice(0, -1);
	return planSaveInstallment(chart, plans, plan.id, { ...termsOf(plan), rows }, { now });
}

/** "Mark paid" settles a row after at least one payment; "Mark unpaid" undoes it. */
export function planMarkRowPaid(
	chart: Chart,
	plans: Installment[],
	plan: Installment,
	due: IsoDate,
	settled: boolean,
	{ now }: { now: Date }
): ChartWrite[] {
	const i = rowIndex(plan, due);
	const { settled: _s, ...row } = plan.rows[i];
	const rows = plan.rows.with(i, settled ? { ...row, settled: true } : row);
	return planSaveInstallment(chart, plans, plan.id, { ...termsOf(plan), rows }, { now });
}

/** Deleting is only for a plan nothing pays; its Accounts always stay. */
export function planDeleteInstallment(chart: Chart, planId: string): ChartWrite[] {
	if (planHasPayments(chart, 'installment', planId))
		throw new Error('Transactions pay this plan: unlink or delete them first');
	return [{ op: 'deleteInstallment', id: planId }];
}
