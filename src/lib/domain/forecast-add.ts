// Adding to and adjusting a Forecast: a one-off Outflow or Inflow (a Scheduled Transaction that
// happens once), and "Bill with next payment" for a charge on a card or payable. Pure TypeScript.
import type { IsoDate } from './chart.ts';
import { paymentDates, type Charge, type ForecastInput } from './forecast.ts';
import { planSaveInstallment } from './installments.ts';
import { addDays, planChangeOccurrence } from './scheduled.ts';
import type { PlanDraft } from './scheduled-views.ts';
import type { ChartWrite } from './writes.ts';

/**
 * The plan draft for a one-off. An Outflow is paid from `accountId` (a Funding Account) to
 * `otherId`; an Inflow lands in `accountId` from `otherId`. The amount is the text typed.
 */
export function oneOffDraft({
	kind,
	description,
	date,
	amount,
	accountId,
	otherId,
	section
}: {
	kind: 'outflow' | 'inflow';
	description: string;
	date: IsoDate;
	amount: string;
	accountId: string;
	otherId: string;
	section: string | null;
}): PlanDraft {
	const mine = { accountId, amount };
	const other = { accountId: otherId, amount };
	return {
		description,
		note: '',
		tags: [],
		from: [kind === 'outflow' ? mine : other],
		to: [kind === 'outflow' ? other : mine],
		fees: [],
		rule: { type: 'once', date },
		end: { type: 'never' },
		section
	};
}

/**
 * "Bill with next payment": the charge counts from the day after this payment's date, so it
 * joins the following one.
 */
export const planBillLater = (
	input: ForecastInput,
	charge: Charge,
	paymentDate: IsoDate,
	now: Date
): ChartWrite[] => planBillOn(input, [charge], addDays(paymentDate, 1), now);

/**
 * Moves charges on a Liability to one of its payments: each counts from the day after the
 * payment before the chosen one, so the chosen payment is the one that bills it.
 */
export function planBillWithPayment(
	input: ForecastInput,
	charges: Charge[],
	liabilityId: string,
	paymentDate: IsoDate,
	now: Date
): ChartWrite[] {
	const dates = paymentDates(input, liabilityId, paymentDate);
	if (!dates.includes(paymentDate))
		throw new Error(`${paymentDate} is not a payment of this Liability`);
	const prev = dates.filter((d) => d < paymentDate).at(-1);
	if (!prev) throw new Error('There is no earlier payment to bill after');
	return planBillOn(input, charges, addDays(prev, 1), now);
}

/**
 * Bills charges from `day`. A recorded charge gets `billOn` (its own date stays); a Scheduled
 * charge or an Installment Row is moved to that day. Charges from one plan share one write.
 */
function planBillOn(
	input: ForecastInput,
	charges: Charge[],
	day: IsoDate,
	now: Date
): ChartWrite[] {
	const scheduled = new Map(input.scheduled.map((p) => [p.id, p]));
	const installments = new Map(input.installments.map((p) => [p.id, p]));
	const writes = new Map<string, ChartWrite>();
	for (const charge of charges) {
		if (charge.from === 'transaction') {
			const tx = input.chart.transaction(charge.txId ?? '');
			if (!tx) throw new Error('That Transaction no longer exists');
			const { id, ...data } = tx;
			writes.set(`tx:${id}`, {
				op: 'setTransaction',
				id,
				data: { ...data, billOn: day, updatedAt: now }
			});
			continue;
		}
		const link = charge.link;
		if (!link) throw new Error('That charge has no plan');
		if (link.plan === 'scheduled') {
			const plan = scheduled.get(link.planId);
			if (!plan) throw new Error('That plan no longer exists');
			const [w] = planChangeOccurrence(input.chart, plan, link.due, { movedTo: day }, { now });
			if (w.op === 'setScheduled') scheduled.set(plan.id, { id: plan.id, ...w.data });
			writes.set(`scheduled:${plan.id}`, w);
			continue;
		}
		const plan = installments.get(link.planId);
		if (!plan) throw new Error('That plan no longer exists');
		const { id, createdAt: _c, updatedAt: _u, ...terms } = plan;
		const rows = plan.rows.map((r) => (r.due === link.due ? { ...r, date: day } : r));
		const [w] = planSaveInstallment(
			input.chart,
			[...installments.values()],
			id,
			{ ...terms, rows },
			{ now }
		);
		if (w.op === 'setInstallment') installments.set(id, { id, ...w.data });
		writes.set(`installment:${id}`, w);
	}
	return [...writes.values()];
}
