// What Scheduled Transaction occurrences and Installment Plan rows share: the Transactions that
// pay them (ADR 0003's paid link), their paid status, and clearing "Mark paid" when the last
// payment goes. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import type { Installment, PaidLink, Scheduled, Transaction } from './schemas.ts';
import type { ChartWrite } from './writes.ts';

/** Either kind of plan a Transaction can pay. */
export type PayablePlan = Scheduled | Installment;

export type PaidStatus = {
	status: 'unpaid' | 'partly-paid' | 'paid' | 'skipped';
	/** Past its date and not paid or skipped. */
	overdue: boolean;
	/** What the paying Transactions add up to (their To side). */
	paid: number;
	/** What is left; null while the total varies. */
	remaining: number | null;
	payments: Transaction[];
};

/** A Transaction's total: its To side. */
export const txTotal = (tx: Transaction) =>
	tx.entries.reduce((s, e) => s + Math.max(e.amount, 0), 0);

const sameLink = (a: PaidLink, b: PaidLink) =>
	a.plan === b.plan && a.planId === b.planId && a.due === b.due;

/** Transactions whose paid link names this occurrence or row, oldest first. */
export function paymentsFor(chart: Chart, link: PaidLink): Transaction[] {
	return chart
		.transactions()
		.filter((tx) => tx.pays && sameLink(tx.pays, link))
		.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || +a.createdAt - +b.createdAt);
}

/** Whether any Transaction pays this plan, on any date. */
export function planHasPayments(chart: Chart, plan: PaidLink['plan'], planId: string): boolean {
	return chart.transactions().some((tx) => tx.pays?.plan === plan && tx.pays.planId === planId);
}

/**
 * Paid once its paying Transactions reach its total, or once "Mark paid" settles it after at
 * least one payment. Only Transactions pay: nothing is paid without one.
 */
export function paidStatus(
	chart: Chart,
	link: PaidLink,
	item: { date: IsoDate; total: number | null; settled: boolean; skipped: boolean },
	{ today }: { today: IsoDate }
): PaidStatus {
	const payments = paymentsFor(chart, link);
	const paid = payments.reduce((s, tx) => s + txTotal(tx), 0);
	const status: PaidStatus['status'] = item.skipped
		? 'skipped'
		: payments.length === 0
			? 'unpaid'
			: item.settled || (item.total !== null && paid >= item.total)
				? 'paid'
				: 'partly-paid';
	const remaining =
		status === 'paid' || status === 'skipped'
			? 0
			: item.total === null
				? null
				: Math.max(item.total - paid, 0);
	return {
		status,
		overdue: (status === 'unpaid' || status === 'partly-paid') && item.date < today,
		paid,
		remaining,
		payments
	};
}

const isInstallment = (p: PayablePlan): p is Installment => 'rows' in p;

/**
 * "Mark paid" settles the payments made so far. When the last paying Transaction of an occurrence
 * or row is unlinked or deleted, the mark goes too, so a later payment starts from partly paid.
 */
export function clearSettledWithLastPayment(
	chart: Chart,
	tx: Transaction,
	plans: PayablePlan[],
	now: Date
): ChartWrite[] {
	const link = tx.pays;
	if (!link) return [];
	if (paymentsFor(chart, link).some((p) => p.id !== tx.id)) return [];
	const plan = plans.find(
		(p) => p.id === link.planId && isInstallment(p) === (link.plan === 'installment')
	);
	if (!plan) return [];

	if (isInstallment(plan)) {
		const i = plan.rows.findIndex((r) => r.due === link.due);
		if (i < 0 || !plan.rows[i].settled) return [];
		const { settled: _settled, ...row } = plan.rows[i];
		const { id, ...data } = plan;
		const rows = plan.rows.with(i, row);
		return [{ op: 'setInstallment', id, data: { ...data, rows, updatedAt: now } }];
	}

	const change = plan.occurrences[link.due];
	if (!change?.settled) return [];
	const { settled: _settled, ...rest } = change;
	const occurrences = { ...plan.occurrences };
	if (Object.keys(rest).length) occurrences[link.due] = rest;
	else delete occurrences[link.due];
	const { id, ...data } = plan;
	return [{ op: 'setScheduled', id, data: { ...data, occurrences, updatedAt: now } }];
}
