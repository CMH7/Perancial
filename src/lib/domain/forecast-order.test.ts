import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { buildForecast, planSetFundingAccounts, type ForecastInput } from './forecast.ts';
import { placeItem, planSetOutflowOrder } from './forecast-order.ts';
import type { Forecast, Scheduled } from './schemas.ts';
import { account, now, roots } from './test-fixtures.ts';

const accounts = [
	...roots,
	account('everyday', 'asset', 'asset'),
	account('savings', 'asset', 'asset'),
	account('bills', 'expense', 'expense')
];
const bill = (id: string, day: number): Scheduled => ({
	id,
	versions: [
		{
			from: `2026-11-${day}`,
			description: id,
			note: '',
			tags: [],
			lines: [
				{ accountId: 'everyday', side: 'from', amount: 10_000 },
				{ accountId: 'bills', side: 'to', amount: 10_000 }
			],
			rule: { type: 'once', date: `2026-11-${day}` }
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now
});
const doc = (extra: Partial<Forecast> = {}): Forecast => ({
	id: '2026-11-30',
	fundingAccounts: ['everyday', 'savings'],
	createdAt: now,
	updatedAt: now,
	...extra
});
function input(forecasts: Forecast[] = [doc()]): ForecastInput {
	return {
		chart: buildChart(accounts, []),
		scheduled: [bill('water', 18), bill('power', 20), bill('phone', 22)],
		installments: [],
		forecasts,
		settings: null,
		today: '2026-11-20'
	};
}
const keys = (i: ForecastInput) => buildForecast(i, '2026-11-30').outflows.map((o) => o.key);
const k = (id: string, day: number) => `scheduled:${id}:2026-11-${day}`;

describe('Placing an item in a list', () => {
	it('moves it before or after another, or to the end', () => {
		expect(placeItem(['a', 'b', 'c'], 'c', { before: 'a' })).toEqual(['c', 'a', 'b']);
		expect(placeItem(['a', 'b', 'c'], 'a', { after: 'b' })).toEqual(['b', 'a', 'c']);
		expect(placeItem(['a', 'b', 'c'], 'a', {})).toEqual(['b', 'c', 'a']);
		expect(placeItem(['a', 'b'], 'x', { before: 'b' })).toEqual(['a', 'x', 'b']);
	});
});

describe('Outflow order', () => {
	it('is by due date until the owner orders them', () => {
		expect(keys(input())).toEqual([k('water', 18), k('power', 20), k('phone', 22)]);
	});

	it("follows the Cut-off's saved order, unordered ones after by due date", () => {
		const i = input([doc({ outflowOrder: [k('phone', 22), 'scheduled:gone:2026-11-01'] })]);
		expect(keys(i)).toEqual([k('phone', 22), k('water', 18), k('power', 20)]);
	});

	it('saves the whole order on the Cut-off, keeping its Funding Accounts', () => {
		const order = [k('power', 20), k('water', 18), k('phone', 22)];
		expect(planSetOutflowOrder(input(), '2026-11-30', order, now)).toEqual([
			{
				op: 'setForecast',
				id: '2026-11-30',
				data: {
					fundingAccounts: ['everyday', 'savings'],
					outflowOrder: order,
					createdAt: now,
					updatedAt: now
				}
			}
		]);
	});

	it('is kept when the Funding Accounts change or are reordered', () => {
		const order = [k('phone', 22)];
		const [w] = planSetFundingAccounts(
			input([doc({ outflowOrder: order })]),
			'2026-11-30',
			['savings', 'everyday'],
			now
		);
		expect(w).toMatchObject({
			data: { fundingAccounts: ['savings', 'everyday'], outflowOrder: order }
		});
	});
});
