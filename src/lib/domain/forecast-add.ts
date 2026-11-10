// Adding to and adjusting a Forecast: a one-off Outflow or Inflow (a Scheduled Transaction that
// happens once), and "Bill with next payment" for a charge on a card or payable. Pure TypeScript.
import type { IsoDate } from './chart.ts';
import type { Charge, ForecastInput } from './forecast.ts';
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
 * joins the following one. A recorded charge gets `billOn` (its own date stays); a Scheduled
 * charge or an Installment Row is moved to that day.
 */
export function planBillLater(
	input: ForecastInput,
	charge: Charge,
	paymentDate: IsoDate,
	now: Date
): ChartWrite[] {
	const day = addDays(paymentDate, 1);
	if (charge.from === 'transaction') {
		const tx = input.chart.transaction(charge.txId ?? '');
		if (!tx) throw new Error('That Transaction no longer exists');
		const { id, ...data } = tx;
		return [{ op: 'setTransaction', id, data: { ...data, billOn: day, updatedAt: now } }];
	}
	const link = charge.link;
	if (!link) throw new Error('That charge has no plan');
	if (link.plan === 'scheduled') {
		const plan = input.scheduled.find((p) => p.id === link.planId);
		if (!plan) throw new Error('That plan no longer exists');
		return planChangeOccurrence(input.chart, plan, link.due, { movedTo: day }, { now });
	}
	const plan = input.installments.find((p) => p.id === link.planId);
	if (!plan) throw new Error('That plan no longer exists');
	const { id, createdAt: _c, updatedAt: _u, ...terms } = plan;
	const rows = plan.rows.map((r) => (r.due === link.due ? { ...r, date: day } : r));
	return planSaveInstallment(input.chart, input.installments, id, { ...terms, rows }, { now });
}
