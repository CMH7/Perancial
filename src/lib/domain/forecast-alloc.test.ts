import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { buildForecast, type ForecastInput } from './forecast.ts';
import {
	allocationCandidates,
	lastReserve,
	planAllocateEarly,
	planUndoAllocation
} from './forecast-alloc.ts';
import type { Scheduled, Transaction } from './schemas.ts';
import { account, now, roots, tx } from './test-fixtures.ts';

const accounts = [
	...roots,
	account('everyday', 'asset', 'asset'),
	account('reserve', 'asset', 'asset'),
	account('card', 'liability', 'liability'),
	account('insurance', 'expense', 'expense')
];
const insurance: Scheduled = {
	id: 'ins',
	versions: [
		{
			from: '2026-12-05',
			description: 'Insurance',
			note: '',
			tags: [],
			lines: [
				{ accountId: 'everyday', side: 'from', amount: 250_000 },
				{ accountId: 'insurance', side: 'to', amount: 250_000 }
			],
			rule: { type: 'monthly', day: 5, start: '2026-12-05' }
		}
	],
	end: { type: 'never' },
	occurrences: {},
	createdAt: now,
	updatedAt: now
};

function input(over: Partial<ForecastInput> = {}): ForecastInput {
	return {
		chart: buildChart(accounts, []),
		scheduled: [insurance],
		installments: [],
		forecasts: [
			{ id: '2026-11-30', fundingAccounts: ['everyday'], createdAt: now, updatedAt: now }
		],
		settings: null,
		today: '2026-11-20',
		...over
	};
}

const target = (i: ForecastInput) =>
	buildForecast(i, '2026-12-15').outflows.find((o) => o.key === 'scheduled:ins:2026-12-05')!;

describe('Allocate early', () => {
	it("offers the next Cut-off's open Outflows, then later ones", () => {
		expect(allocationCandidates(input(), '2026-11-30').map((o) => o.key)).toEqual([
			'scheduled:ins:2026-12-05'
		]);
		expect(allocationCandidates(input(), '2026-11-30', { cutoffs: 3 }).map((o) => o.key)).toEqual([
			'scheduled:ins:2026-12-05',
			'scheduled:ins:2027-01-05'
		]);
	});

	it('writes the transfer, the target sources and the reserve as the target Funding Account', () => {
		const writes = planAllocateEarly(input(), {
			cutoff: '2026-11-30',
			target: target(input()),
			reserveId: 'reserve',
			fromId: 'everyday',
			transferId: 'ea1',
			now
		});
		expect(writes).toEqual([
			{
				op: 'setScheduled',
				id: 'ea1',
				data: {
					versions: [
						{
							from: '2026-11-30',
							description: 'Reserve for Insurance',
							note: '',
							tags: [],
							lines: [
								{ accountId: 'everyday', side: 'from', amount: 250_000 },
								{ accountId: 'reserve', side: 'to', amount: 250_000 }
							],
							rule: { type: 'once', date: '2026-11-30' }
						}
					],
					end: { type: 'never' },
					occurrences: {},
					allocates: { plan: 'scheduled', planId: 'ins', due: '2026-12-05' },
					createdAt: now,
					updatedAt: now
				}
			},
			expect.objectContaining({
				op: 'setScheduled',
				id: 'ins',
				data: expect.objectContaining({
					occurrences: { '2026-12-05': { sources: [{ accountId: 'reserve', amount: 250_000 }] } }
				})
			}),
			{
				op: 'setForecast',
				id: '2026-12-15',
				data: { fundingAccounts: ['everyday', 'reserve'], createdAt: now, updatedAt: now }
			}
		]);
	});

	it('dates the transfer on the Cut-off date, when its pay lands, or today when later', () => {
		const at = (cutoff: string) =>
			planAllocateEarly(input({ forecasts: [] }), {
				cutoff,
				target: {
					...target(input()),
					link: { plan: 'scheduled', planId: 'ins', due: '2027-01-05' }
				},
				reserveId: 'reserve',
				fromId: 'everyday',
				transferId: 'ea2',
				now
			})[0];
		expect(at('2026-12-30')).toMatchObject({
			data: { versions: [{ rule: { date: '2026-12-30' } }] }
		});
		expect(at('2026-11-15')).toMatchObject({
			data: { versions: [{ rule: { date: '2026-11-20' } }] }
		});
	});

	it('refuses a reserve that is not an Asset Leaf, or paying from outside the Funding Accounts', () => {
		const base = { cutoff: '2026-11-30', target: target(input()), transferId: 'x', now };
		expect(() =>
			planAllocateEarly(input(), { ...base, reserveId: 'card', fromId: 'everyday' })
		).toThrow(/reserve/);
		expect(() =>
			planAllocateEarly(input(), { ...base, reserveId: 'reserve', fromId: 'reserve' })
		).toThrow(/Funding Account/);
	});

	it('remembers the last reserve used', () => {
		const [transfer] = planAllocateEarly(input(), {
			cutoff: '2026-11-30',
			target: target(input()),
			reserveId: 'reserve',
			fromId: 'everyday',
			transferId: 'ea1',
			now
		});
		if (transfer.op !== 'setScheduled') throw new Error('expected a plan');
		expect(lastReserve([insurance, { id: 'ea1', ...transfer.data }])).toBe('reserve');
		expect(lastReserve([insurance])).toBeNull();
	});
});

describe('Undo allocation', () => {
	const allocated = () => {
		const writes = planAllocateEarly(input(), {
			cutoff: '2026-11-30',
			target: target(input()),
			reserveId: 'reserve',
			fromId: 'everyday',
			transferId: 'ea1',
			now
		});
		const plans = writes.flatMap((w) => (w.op === 'setScheduled' ? [{ id: w.id, ...w.data }] : []));
		return plans as Scheduled[];
	};

	it("deletes the transfer and gives the target back its plan's default sources", () => {
		const scheduled = allocated();
		const transfer = scheduled.find((p) => p.id === 'ea1')!;
		const writes = planUndoAllocation(input({ scheduled }), transfer, now);
		expect(writes[0]).toEqual({ op: 'deleteScheduled', id: 'ea1' });
		expect(writes[1]).toMatchObject({ op: 'setScheduled', id: 'ins', data: { occurrences: {} } });
	});

	it('is refused once the money has moved', () => {
		const scheduled = allocated();
		const transfer = scheduled.find((p) => p.id === 'ea1')!;
		const paid: Transaction = {
			...tx('move', '2026-11-30', [
				['reserve', 250_000],
				['everyday', -250_000]
			]),
			pays: { plan: 'scheduled', planId: 'ea1', due: '2026-11-30' }
		};
		expect(() =>
			planUndoAllocation(input({ scheduled, chart: buildChart(accounts, [paid]) }), transfer, now)
		).toThrow(/moved/);
	});
});
