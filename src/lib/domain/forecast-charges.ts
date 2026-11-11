// Recording a Liability payment's planned charges with it: the Scheduled Occurrences and
// Installment Rows charged to that Liability and billed with the payment, still unpaid, each as a
// Transaction draft on its own date that pays it (ADR 0003). Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import { chargesFor, type ChargeInput } from './forecast.ts';
import { installmentRecordDraft } from './installment-paying.ts';
import { rowStatuses } from './installments.ts';
import { recordDraft } from './paying.ts';
import { occurrenceStatus, occurrencesOf } from './scheduled.ts';
import type { PaidLink } from './schemas.ts';
import { planSaveTransaction, type TransactionDraft } from './transactions.ts';
import type { ChartWrite } from './writes.ts';

export type PlannedCharge = {
	key: string;
	label: string;
	/** Its own date: the recorded Transaction keeps it. */
	date: IsoDate;
	/** What is left to record; null when the amount varies and none was set. */
	amount: number | null;
	pays: PaidLink;
	draft: TransactionDraft;
	/** Why it can't be recorded now: `later` (dated after today) or `amount` (none set). */
	blocked?: 'later' | 'amount';
};

/** The unpaid planned charges billed with the Liability payment due on `paymentDate`. */
export function plannedCharges(
	input: ChargeInput,
	liabilityId: string,
	paymentDate: IsoDate,
	{ today }: { today: IsoDate }
): PlannedCharge[] {
	const { chart } = input;
	return chargesFor(input, liabilityId, paymentDate).flatMap((c): PlannedCharge[] => {
		const link = c.link;
		if (c.from === 'transaction' || !link) return [];
		let draft: TransactionDraft;
		let amount: number | null;
		if (link.plan === 'scheduled') {
			const plan = input.scheduled.find((p) => p.id === link.planId);
			const occurrence = plan
				? occurrencesOf(plan, { from: c.date, to: c.date }).find((o) => o.due === link.due)
				: undefined;
			if (!plan || !occurrence) return [];
			const status = occurrenceStatus(chart, occurrence, { today });
			if (status.status === 'paid' || status.status === 'skipped') return [];
			draft = { ...recordDraft({ plan, occurrence, status }, { today }), date: occurrence.date };
			amount = status.status === 'partly-paid' ? status.remaining : occurrence.total;
		} else {
			const plan = input.installments.find((p) => p.id === link.planId);
			const row = plan
				? rowStatuses(chart, plan, { today }).find((r) => r.row.due === link.due)
				: undefined;
			if (!plan || !row || row.state === 'paid' || row.state === 'before') return [];
			draft = { ...installmentRecordDraft(chart, plan, link.due, { today }), date: row.row.date };
			amount = row.remaining;
		}
		const blocked = c.date > today ? 'later' : amount === null ? 'amount' : undefined;
		return [
			{
				key: c.key,
				label: c.label,
				date: c.date,
				amount,
				pays: link,
				draft,
				...(blocked ? { blocked } : {})
			}
		];
	});
}

const text = (cents: number) =>
	`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

/**
 * The draft for recording a planned charge at `amount`. At its planned amount the draft stays;
 * otherwise it becomes one From and one To line for that amount.
 */
export function plannedChargeDraft(charge: PlannedCharge, amount: number): TransactionDraft {
	if (amount === charge.amount) return charge.draft;
	const { draft } = charge;
	return {
		...draft,
		from: [{ accountId: draft.from[0]?.accountId ?? '', amount: text(amount) }],
		to: [{ accountId: draft.to[0]?.accountId ?? '', amount: text(amount) }],
		fees: []
	};
}

/** One Transaction per planned charge, each paying it. Throws on the first that isn't valid. */
export function planRecordCharges(
	chart: Chart,
	items: { charge: PlannedCharge; amount: number; id: string }[],
	{ now, today }: { now: Date; today: IsoDate }
): ChartWrite[] {
	return items.flatMap(({ charge, amount, id }) => {
		try {
			return planSaveTransaction(chart, plannedChargeDraft(charge, amount), {
				id,
				now,
				today,
				pays: charge.pays
			});
		} catch (err) {
			throw new Error(`${charge.label}: ${(err as Error).message}`, { cause: err });
		}
	});
}
