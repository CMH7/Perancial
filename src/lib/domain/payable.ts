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

/** The plan with Mark paid taken off one occurrence or row, or null when it wasn't marked. */
function unsettled(plan: PayablePlan, due: IsoDate, now: Date): PayablePlan | null {
	if (isInstallment(plan)) {
		const i = plan.rows.findIndex((r) => r.due === due);
		if (i < 0 || !plan.rows[i].settled) return null;
		const { settled: _settled, ...row } = plan.rows[i];
		return { ...plan, rows: plan.rows.with(i, row), updatedAt: now };
	}
	const change = plan.occurrences[due];
	if (!change?.settled) return null;
	const { settled: _settled, ...rest } = change;
	const occurrences = { ...plan.occurrences };
	if (Object.keys(rest).length) occurrences[due] = rest;
	else delete occurrences[due];
	return { ...plan, occurrences, updatedAt: now };
}

const planWrite = (plan: PayablePlan): ChartWrite => {
	if (isInstallment(plan)) {
		const { id, ...data } = plan;
		return { op: 'setInstallment', id, data };
	}
	const { id, ...data } = plan;
	return { op: 'setScheduled', id, data };
};

/**
 * "Mark paid" settles the payments made so far. When the last paying Transactions of an occurrence
 * or row are unlinked or deleted (`gone`, together in one change), the mark goes too, so a later
 * payment starts from partly paid. Each plan is written at most once.
 */
export function clearSettledWhenGone(
	chart: Chart,
	gone: Transaction[],
	plans: PayablePlan[],
	now: Date
): ChartWrite[] {
	const goneIds = new Set(gone.map((tx) => tx.id));
	const working = new Map(plans.map((p) => [`${isInstallment(p)}:${p.id}`, p]));
	const changed = new Set<string>();
	const seen: PaidLink[] = [];
	for (const { pays: link } of gone) {
		if (!link || seen.some((l) => sameLink(l, link))) continue;
		seen.push(link);
		if (paymentsFor(chart, link).some((p) => !goneIds.has(p.id))) continue;
		const key = `${link.plan === 'installment'}:${link.planId}`;
		const plan = working.get(key);
		if (!plan) continue;
		const next = unsettled(plan, link.due, now);
		if (!next) continue;
		working.set(key, next);
		changed.add(key);
	}
	return [...changed].map((key) => planWrite(working.get(key)!));
}

/** One Transaction unlinked or deleted: see `clearSettledWhenGone`. */
export function clearSettledWithLastPayment(
	chart: Chart,
	tx: Transaction,
	plans: PayablePlan[],
	now: Date
): ChartWrite[] {
	return clearSettledWhenGone(chart, [tx], plans, now);
}
