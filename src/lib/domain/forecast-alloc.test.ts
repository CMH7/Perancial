import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import { buildForecast, type ForecastInput } from './forecast.ts';
import {
	allocationCandidates,
	lastReserve,
	planAllocateEarly,
	planResizeAllocation,
	planUndoAllocation
} from './forecast-alloc.ts';
import { statementId, type Scheduled, type Statement, type Transaction } from './schemas.ts';
import type { ChartWrite } from './writes.ts';
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

describe('Early allocation for a Credit Card Statement', () => {
	// Visa closes on the 20th and is due on the 9th: the 20 Nov Statement is due 9 Dec, in the
	// 15 Dec Cut-off, so it is allocated from the 30 Nov Cut-off.
	const cardAccounts = [
		...accounts,
		account('visa', 'liability', 'liability', { card: { statementDay: 20, dueDay: 9 } }),
		account('dining', 'expense', 'expense')
	];
	const dinner = tx('dinner', '2026-11-10', [
		['dining', 300_000],
		['visa', -300_000]
	]);
	const cardInput = (over: Partial<ForecastInput> = {}) =>
		input({ chart: buildChart(cardAccounts, [dinner]), statements: [], ...over });
	const key = 'statement:visa:2026-11-20';
	const statementOf = (i: ForecastInput) =>
		buildForecast(i, '2026-12-15').outflows.find((o) => o.key === key)!;

	/** The input after the writes are applied. */
	function applied(i: ForecastInput, writes: ChartWrite[]): ForecastInput {
		let { scheduled, forecasts } = i;
		let statements = i.statements ?? [];
		for (const w of writes) {
			if (w.op === 'setScheduled')
				scheduled = [...scheduled.filter((p) => p.id !== w.id), { id: w.id, ...w.data }];
			if (w.op === 'deleteScheduled') scheduled = scheduled.filter((p) => p.id !== w.id);
			if (w.op === 'setForecast')
				forecasts = [...forecasts.filter((f) => f.id !== w.id), { id: w.id, ...w.data }];
			if (w.op === 'setStatement') {
				const [cardId, statementDate] = [w.id.slice(0, -11), w.id.slice(-10)];
				const doc: Statement = { id: w.id, cardId, statementDate, ...w.data };
				statements = [...statements.filter((d) => d.id !== w.id), doc];
			}
		}
		return { ...i, scheduled, forecasts, statements };
	}
	const allocate = (i: ForecastInput) =>
		planAllocateEarly(i, {
			cutoff: '2026-11-30',
			target: statementOf(i),
			reserveId: 'reserve',
			fromId: 'everyday',
			transferId: 'ea1',
			now
		});
	const enter = (i: ForecastInput, amount: number): ForecastInput => ({
		...i,
		statements: (i.statements ?? []).map((d) => ({ ...d, amount }))
	});

	it('is offered from the Cut-off before the Statement is due', () => {
		expect(allocationCandidates(cardInput(), '2026-11-30').map((o) => o.key)).toContain(key);
	});

	it('writes the transfer for the Statement, its reserve source, and the reserve as funding', () => {
		const writes = allocate(cardInput());
		expect(writes[0]).toMatchObject({
			op: 'setScheduled',
			id: 'ea1',
			data: {
				allocates: { plan: 'statement', planId: 'visa', due: '2026-11-20' },
				versions: [
					{
						lines: [
							{ accountId: 'everyday', side: 'from', amount: 300_000 },
							{ accountId: 'reserve', side: 'to', amount: 300_000 }
						]
					}
				]
			}
		});
		expect(writes[1]).toEqual({
			op: 'setStatement',
			id: statementId('visa', '2026-11-20'),
			data: {
				amount: null,
				sources: [{ accountId: 'reserve', amount: 300_000 }],
				createdAt: now,
				updatedAt: now
			}
		});
		expect(writes[2]).toMatchObject({
			op: 'setForecast',
			id: '2026-12-15',
			data: { fundingAccounts: ['everyday', 'reserve'] }
		});
	});

	it('shows as paid from the reserve in its own Cut-off, and says when the reserve is short or over', () => {
		const after = applied(cardInput(), allocate(cardInput()));
		const o = statementOf(after);
		expect(o.sources).toMatchObject([{ accountId: 'reserve', amount: 300_000, valid: true }]);
		expect(o).toMatchObject({ allocatedIn: '2026-11-30', allocationGap: 0 });
		expect(statementOf(enter(after, 350_000)).allocationGap).toBe(50_000);
		expect(statementOf(enter(after, 250_000)).allocationGap).toBe(-50_000);
		expect(statementOf(cardInput()).allocationGap).toBeUndefined();
	});

	it('counts only the reserve as allocated earlier, not a part already paid elsewhere', () => {
		const part = tx('part', '2026-11-21', [
			['visa', 100_000],
			['everyday', -100_000]
		]);
		const before = cardInput({ chart: buildChart(cardAccounts, [dinner, part]) });
		const after = applied(before, allocate(before));
		expect(statementOf(after).sources).toMatchObject([
			{ accountId: 'everyday', amount: 100_000, paid: 100_000 },
			{ accountId: 'reserve', amount: 200_000 }
		]);
		const lanes = buildForecast(after, '2026-12-15').lanes;
		const lane = (id: string) => lanes.find((l) => l.accountId === id)!;
		expect(lane('everyday').allocatedFor).toBe(0);
		expect(lane('reserve').allocatedFor).toBe(200_000);
	});

	it('undo deletes the transfer and clears the Statement’s reserve source', () => {
		const after = enter(applied(cardInput(), allocate(cardInput())), 320_000);
		const transfer = after.scheduled.find((p) => p.id === 'ea1')!;
		expect(planUndoAllocation(after, transfer, now)).toEqual([
			{ op: 'deleteScheduled', id: 'ea1' },
			expect.objectContaining({
				op: 'setStatement',
				id: statementId('visa', '2026-11-20'),
				data: expect.objectContaining({ amount: 320_000, sources: [] })
			})
		]);
	});

	it('resizes the transfer and the reserve source to a changed Statement, up or down', () => {
		const after = applied(cardInput(), allocate(cardInput()));
		for (const amount of [350_000, 250_000]) {
			const changed = enter(after, amount);
			const writes = planResizeAllocation(changed, statementOf(changed), now);
			expect(writes[0]).toMatchObject({
				id: 'ea1',
				data: {
					versions: [
						{
							lines: [
								{ accountId: 'everyday', amount },
								{ accountId: 'reserve', amount }
							]
						}
					]
				}
			});
			expect(writes[1]).toMatchObject({
				op: 'setStatement',
				data: { sources: [{ accountId: 'reserve', amount }] }
			});
			expect(statementOf(applied(changed, writes)).allocationGap).toBe(0);
		}
	});

	it('refuses to resize once the money has moved', () => {
		const after = enter(applied(cardInput(), allocate(cardInput())), 350_000);
		const moved: Transaction = {
			...tx('move', '2026-11-30', [
				['reserve', 300_000],
				['everyday', -300_000]
			]),
			pays: { plan: 'scheduled', planId: 'ea1', due: '2026-11-30' }
		};
		const paid = { ...after, chart: buildChart(cardAccounts, [dinner, moved]) };
		expect(() => planResizeAllocation(paid, statementOf(paid), now)).toThrow(/moved/);
	});
});
