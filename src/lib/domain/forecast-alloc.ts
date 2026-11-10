// Early allocation (GLOSSARY): moving money into a reserve during an earlier Cut-off for a
// specific Outflow a later Cut-off funds. A one-time transfer plan carries `allocates` (the
// paid-link shape); the target is then paid from the reserve. Pure TypeScript, no Firebase.
import type { IsoDate } from './chart.ts';
import {
	buildForecast,
	fundingAccountsFor,
	fundingCutoffOf,
	nextCutoff,
	type ForecastInput,
	type ForecastOutflow
} from './forecast.ts';
import { planHasPayments } from './payable.ts';
import type { Installment, PaidLink, PayingSource, Scheduled } from './schemas.ts';
import type { ChartWrite } from './writes.ts';

const keyOf = (l: PaidLink) => `${l.plan}:${l.planId}:${l.due}`;

/**
 * Outflows from the next Cut-offs (one by default) that can be allocated early: open, not
 * already allocated, not themselves an allocation, with something left to pay.
 */
export function allocationCandidates(
	input: ForecastInput,
	cutoff: IsoDate,
	{ cutoffs = 1 }: { cutoffs?: number } = {}
): ForecastOutflow[] {
	const out: ForecastOutflow[] = [];
	let c = cutoff;
	for (let i = 0; i < cutoffs; i++) {
		c = nextCutoff(c);
		for (const o of buildForecast(input, c).outflows)
			if (
				o.carried === undefined &&
				(o.status === 'unpaid' || o.status === 'partly-paid') &&
				!o.allocatedIn &&
				!o.ealloc &&
				o.remaining > 0
			)
				out.push(o);
	}
	return out;
}

/** The reserve the latest Early allocation moved money into, to pick it again. */
export function lastReserve(scheduled: Scheduled[]): string | null {
	const latest = scheduled
		.filter((p) => p.allocates)
		.sort((a, b) => +b.createdAt - +a.createdAt)[0];
	return latest?.versions[0].lines.find((l) => l.side === 'to')?.accountId ?? null;
}

const isAssetLeaf = (input: ForecastInput, id: string) =>
	input.chart.account(id)?.type === 'asset' && !input.chart.isGroup(id);

/** Writes the target's Paying sources on its Occurrence or Row (undefined = plan defaults). */
function setTargetSources(
	input: ForecastInput,
	link: PaidLink,
	sources: PayingSource[] | undefined,
	now: Date
): ChartWrite {
	if (link.plan === 'scheduled') {
		const plan = input.scheduled.find((p) => p.id === link.planId);
		if (!plan) throw new Error('The Outflow’s plan no longer exists');
		const { id, ...data } = plan;
		const occurrences = { ...data.occurrences };
		const { sources: _old, ...rest } = occurrences[link.due] ?? {};
		const change = sources ? { ...rest, sources } : rest;
		if (Object.keys(change).length) occurrences[link.due] = change;
		else delete occurrences[link.due];
		return { op: 'setScheduled', id, data: { ...data, occurrences, updatedAt: now } };
	}
	const plan = input.installments.find((p) => p.id === link.planId);
	if (!plan) throw new Error('The Outflow’s plan no longer exists');
	const { id, ...data } = plan as Installment;
	const i = data.rows.findIndex((r) => r.due === link.due);
	if (i < 0) throw new Error('That row is no longer in this plan');
	const { sources: _old, ...row } = data.rows[i];
	const rows = data.rows.with(i, sources ? { ...row, sources } : row);
	return { op: 'setInstallment', id, data: { ...data, rows, updatedAt: now } };
}

/**
 * Allocates one later Outflow early: a one-time transfer from a Funding Account of this Cut-off
 * into the reserve, dated on the Cut-off date (or today, when later); the target is then paid from the
 * reserve, which joins the target Cut-off's Funding Accounts.
 */
export function planAllocateEarly(
	input: ForecastInput,
	{
		cutoff,
		target,
		reserveId,
		fromId,
		transferId,
		now
	}: {
		cutoff: IsoDate;
		target: Pick<ForecastOutflow, 'link' | 'label' | 'remaining' | 'sources'>;
		reserveId: string;
		fromId: string;
		transferId: string;
		now: Date;
	}
): ChartWrite[] {
	if (!isAssetLeaf(input, reserveId)) throw new Error('The reserve must be an Asset Leaf Account');
	if (!fundingAccountsFor(input, cutoff).ids.includes(fromId))
		throw new Error("Pay from one of this Cut-off's Funding Accounts");
	if (fromId === reserveId) throw new Error('Move the money into a different Account');
	if (target.remaining <= 0) throw new Error('Nothing is left to pay on that Outflow');
	if (input.scheduled.some((p) => p.allocates && keyOf(p.allocates) === keyOf(target.link)))
		throw new Error('That Outflow is already allocated');

	// The day this Cut-off's pay lands, or today when that has passed.
	const date = cutoff < input.today ? input.today : cutoff;
	const amount = target.remaining;
	const transfer: ChartWrite = {
		op: 'setScheduled',
		id: transferId,
		data: {
			versions: [
				{
					from: date,
					description: `Reserve for ${target.label}`,
					note: '',
					tags: [],
					lines: [
						{ accountId: fromId, side: 'from', amount },
						{ accountId: reserveId, side: 'to', amount }
					],
					rule: { type: 'once', date }
				}
			],
			end: { type: 'never' },
			occurrences: {},
			allocates: target.link,
			createdAt: now,
			updatedAt: now
		}
	};

	// Whatever was paid already stays with its source; the rest comes from the reserve.
	const paid = target.sources
		.filter((s) => s.paid > 0 && s.accountId !== reserveId)
		.map((s) => ({ accountId: s.accountId, amount: s.paid }));
	const sources = [...paid, { accountId: reserveId, amount }];

	const writes: ChartWrite[] = [transfer, setTargetSources(input, target.link, sources, now)];
	const targetCutoff = fundingCutoffOf(target.link.due);
	const funding = fundingAccountsFor(input, targetCutoff).ids;
	if (!funding.includes(reserveId)) {
		const existing = input.forecasts.find((f) => f.id === targetCutoff);
		writes.push({
			op: 'setForecast',
			id: targetCutoff,
			data: {
				fundingAccounts: [...funding, reserveId],
				...(existing?.outflowOrder ? { outflowOrder: existing.outflowOrder } : {}),
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			}
		});
	}
	return writes;
}

/**
 * Undo: deletes the transfer and gives the target back its plan's default sources. Refused once
 * a Transaction pays the transfer (the money has moved; move it back with a normal transfer).
 */
export function planUndoAllocation(
	input: ForecastInput,
	transfer: Scheduled,
	now: Date
): ChartWrite[] {
	if (!transfer.allocates) throw new Error('This is not an Early allocation');
	if (planHasPayments(input.chart, 'scheduled', transfer.id))
		throw new Error('The money has moved already. Move it back with a normal transfer instead.');
	const writes: ChartWrite[] = [{ op: 'deleteScheduled', id: transfer.id }];
	try {
		writes.push(setTargetSources(input, transfer.allocates, undefined, now));
	} catch {
		// The target's plan is gone; deleting the transfer is all that is left to do.
	}
	return writes;
}
