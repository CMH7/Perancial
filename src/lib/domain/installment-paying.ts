// Paying Installment Plan rows: the Record form's starting draft, Transactions that could be linked
// after the fact, and naming what a Transaction pays. Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import { rowAdditionals, rowStatuses } from './installments.ts';
import type { Installment, PaidLink, Scheduled, Transaction } from './schemas.ts';
import { addDays } from './scheduled.ts';
import { shortDate } from './scheduled-views.ts';
import type { DraftLine, TransactionDraft } from './transactions.ts';

const amountText = (cents: number) =>
	`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/**
 * The Transaction form for Record on a row, dated today and paid From the plan's paying Account
 * (blank, so it fills). Lender plans split the row: principal To the Liability, interest To the
 * Interest Account, additionals To the Fees Account. Internal plans put it all into the repaid
 * Asset. A Partly Paid row asks only for what is left, counting earlier payments against interest
 * first, then additionals, then principal.
 */
export function installmentRecordDraft(
	chart: Chart,
	plan: Installment,
	due: IsoDate,
	{ today }: { today: IsoDate }
): TransactionDraft {
	const status = rowStatuses(chart, plan, { today }).find((s) => s.row.due === due);
	if (!status) throw new Error('That row is no longer in this plan');
	const { row } = status;

	let paid = status.paid;
	const take = (amount: number) => {
		const covered = Math.min(paid, amount);
		paid -= covered;
		return amount - covered;
	};
	const interest = take(row.interest);
	const additionals = take(rowAdditionals(row));
	const principal = take(row.principal);

	const { repaid, interest: interestId, fees } = plan.accounts;
	const parts: [string, number][] =
		plan.kind === 'lender'
			? [
					[repaid, principal],
					[interestId!, interest],
					[fees!, additionals]
				]
			: [[repaid, principal + interest + additionals]];
	const to: DraftLine[] = [];
	for (const [accountId, cents] of parts) {
		if (cents <= 0) continue;
		const line = to.find((l) => l.accountId === accountId);
		if (line) line.amount = amountText(Math.round(Number(line.amount) * 100) + cents);
		else to.push({ accountId, amount: amountText(cents) });
	}
	return {
		date: today,
		description: `${plan.title} #${row.n}`,
		note: additionals > 0 ? row.additionals.map((a) => a.description).join(', ') : '',
		status: 'cleared',
		tags: [...plan.tags],
		from: [{ accountId: plan.accounts.paying, amount: '' }],
		to,
		fees: []
	};
}

const LINK_WINDOW_DAYS = 31;
const dayNumber = (d: IsoDate) =>
	Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 864e5;

/** Unlinked Transactions on the plan's repaid Account within 31 days of the row, nearest first. */
export function installmentLinkCandidates(
	chart: Chart,
	plan: Installment,
	due: IsoDate
): Transaction[] {
	const row = plan.rows.find((r) => r.due === due);
	if (!row) return [];
	const from = addDays(row.date, -LINK_WINDOW_DAYS);
	const to = addDays(row.date, LINK_WINDOW_DAYS);
	const distance = (tx: Transaction) => Math.abs(dayNumber(tx.date!) - dayNumber(row.date));
	return chart
		.transactionsFor(plan.accounts.repaid)
		.filter((tx) => tx.origin === 'normal' && !tx.pays)
		.filter((tx) => tx.date! >= from && tx.date! <= to)
		.sort((a, b) => distance(a) - distance(b) || a.date!.localeCompare(b.date!));
}

/** What a Transaction pays, by name ("Rent, 5 Dec 2026" or "Claude #9, 9 Nov 2026"), and its page. */
export function paidLinkLabel(
	link: PaidLink,
	{ scheduled, installments }: { scheduled: Scheduled[]; installments: Installment[] }
): { text: string; kind: PaidLink['plan'] | null } {
	const when = shortDate(link.due);
	if (link.plan === 'installment') {
		const plan = installments.find((p) => p.id === link.planId);
		const row = plan?.rows.find((r) => r.due === link.due);
		if (plan && row) return { text: `${plan.title} #${row.n}, ${when}`, kind: 'installment' };
		if (plan) return { text: `${plan.title}, ${when}`, kind: 'installment' };
	} else {
		const plan = scheduled.find((p) => p.id === link.planId);
		if (plan) {
			const name =
				plan.versions.findLast((v) => v.from <= link.due)?.description ??
				plan.versions[0].description;
			return { text: `${name}, ${when}`, kind: 'scheduled' };
		}
	}
	return { text: `a deleted plan, ${when}`, kind: null };
}
