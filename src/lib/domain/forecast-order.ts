// Reordering a Forecast: the Funding Account lanes (their saved order) and the Outflow cards
// (a per-Cut-off list of Outflow keys). Pure TypeScript, no Firebase.
import type { IsoDate } from './chart.ts';
import { fundingAccountsFor, type ForecastInput } from './forecast.ts';
import type { ChartWrite } from './writes.ts';

/** The list with `item` moved before or after another (to the end when neither is given). */
export function placeItem<T>(list: readonly T[], item: T, at: { before?: T; after?: T }): T[] {
	const rest = list.filter((x) => x !== item);
	const anchor = at.before ?? at.after;
	const i = anchor === undefined ? -1 : rest.indexOf(anchor);
	if (i < 0) return [...rest, item];
	rest.splice(at.before !== undefined ? i : i + 1, 0, item);
	return rest;
}

/** Saves the owner's Outflow order on this Cut-off, keeping its Funding Accounts. */
export function planSetOutflowOrder(
	input: ForecastInput,
	cutoff: IsoDate,
	keys: string[],
	now: Date
): ChartWrite[] {
	const existing = input.forecasts.find((f) => f.id === cutoff);
	return [
		{
			op: 'setForecast',
			id: cutoff,
			data: {
				fundingAccounts: fundingAccountsFor(input, cutoff).ids,
				outflowOrder: [...new Set(keys)],
				createdAt: existing?.createdAt ?? now,
				updatedAt: now
			}
		}
	];
}
