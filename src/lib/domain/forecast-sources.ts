// Editing an Outflow's Paying sources on the Forecast: the drawer's checks, moving a source to
// another lane (drag), splitting one with Copy and paste, and saving them on the Occurrence or
// Row they fund (ADR 0005). Every path ends in the same stored `sources`. Pure TypeScript.
import type { IsoDate } from './chart.ts';
import {
	fundingAccountsFor,
	type ForecastInput,
	type ForecastOutflow,
	type ResolvedSource
} from './forecast.ts';
import type { Installment, PayingSource, Scheduled } from './schemas.ts';
import type { DraftError } from './transactions.ts';
import type { ChartWrite } from './writes.ts';

/** Same Account twice becomes one source with both amounts. */
function merged(sources: PayingSource[]): PayingSource[] {
	const out: PayingSource[] = [];
	for (const s of sources) {
		const same = out.find((x) => x.accountId === s.accountId);
		if (same) same.amount += s.amount;
		else if (s.amount > 0) out.push({ ...s });
	}
	return out;
}

const plain = (sources: ResolvedSource[]): PayingSource[] =>
	sources.map((s) => ({ accountId: s.accountId, amount: s.amount }));

/** Drag: the whole source moves to another Account. A source with payments stays put. */
export function moveSource(sources: ResolvedSource[], from: string, to: string): PayingSource[] {
	const s = sources.find((x) => x.accountId === from);
	if (!s) throw new Error('That source is no longer there');
	if (s.paid > 0) throw new Error('This source is already paid in part; record or edit it instead');
	return merged(plain(sources).map((x) => (x.accountId === from ? { ...x, accountId: to } : x)));
}

/**
 * Paste: moves `amount` out of the copied source (no more than its unpaid part) to another
 * Account, so the total stays. With no copied source (an Unfunded Outflow), it adds `amount`.
 */
export function splitSource(
	sources: ResolvedSource[],
	from: string | null,
	to: string,
	amount: number
): PayingSource[] {
	const list = plain(sources);
	let moved = amount;
	if (from !== null) {
		const s = sources.find((x) => x.accountId === from);
		if (!s) throw new Error('That source is no longer there');
		moved = Math.min(amount, s.amount - s.paid);
		const i = list.findIndex((x) => x.accountId === from);
		list[i] = { ...list[i], amount: list[i].amount - moved };
	}
	return merged([...list, { accountId: to, amount: moved }]);
}

/** The drawer's checks: Funding Accounts of this Cut-off only, each once, amounts above zero. */
export function sourceEditErrors(
	input: ForecastInput,
	cutoff: IsoDate,
	sources: PayingSource[]
): DraftError[] {
	const funding = new Set(fundingAccountsFor(input, cutoff).ids);
	const errors: DraftError[] = [];
	const seen = new Set<string>();
	sources.forEach((s, i) => {
		if (!funding.has(s.accountId))
			errors.push({
				at: `sources.${i}.account`,
				message: "Not one of this Cut-off's Funding Accounts"
			});
		else if (seen.has(s.accountId))
			errors.push({ at: `sources.${i}.account`, message: 'This Account is already a source' });
		if (!Number.isInteger(s.amount) || s.amount <= 0)
			errors.push({ at: `sources.${i}.amount`, message: 'Enter an amount above zero' });
		seen.add(s.accountId);
	});
	return errors;
}

/**
 * Saves an Outflow's Paying sources on its Occurrence or Row. A Carried-over source gets back
 * what it paid before, so the stored amount stays the source's whole share.
 */
export function planSetSources(
	input: ForecastInput,
	cutoff: IsoDate,
	outflow: Pick<ForecastOutflow, 'link' | 'sources'>,
	sources: PayingSource[],
	now: Date
): ChartWrite[] {
	const errors = sourceEditErrors(input, cutoff, sources);
	if (errors.length) throw new Error(errors[0].message);
	const prior = (id: string) => outflow.sources.find((s) => s.accountId === id)?.priorPaid ?? 0;
	const kept = outflow.sources
		.filter((s) => s.priorPaid && !sources.some((x) => x.accountId === s.accountId))
		.map((s) => ({ accountId: s.accountId, amount: s.priorPaid! }));
	const stored = [
		...sources.map((s) => ({ ...s, amount: s.amount + prior(s.accountId) })),
		...kept
	];
	const { link } = outflow;

	if (link.plan === 'scheduled') {
		const plan = input.scheduled.find((p) => p.id === link.planId);
		if (!plan) throw new Error('This plan no longer exists');
		const { id, ...data } = plan as Scheduled;
		const occurrences = {
			...data.occurrences,
			[link.due]: { ...data.occurrences[link.due], sources: stored }
		};
		return [{ op: 'setScheduled', id, data: { ...data, occurrences, updatedAt: now } }];
	}
	const plan = input.installments.find((p) => p.id === link.planId);
	if (!plan) throw new Error('This plan no longer exists');
	const { id, ...data } = plan as Installment;
	const i = data.rows.findIndex((r) => r.due === link.due);
	if (i < 0) throw new Error('That row is no longer in this plan');
	const rows = data.rows.with(i, { ...data.rows[i], sources: stored });
	return [{ op: 'setInstallment', id, data: { ...data, rows, updatedAt: now } }];
}
