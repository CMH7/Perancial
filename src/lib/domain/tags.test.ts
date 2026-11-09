import { describe, expect, it } from 'vitest';
import { buildChart } from './chart.ts';
import type { Transaction } from './schemas.ts';
import { planRemoveTag, planRenameTag, tagCounts } from './tags.ts';
import { account, opening, roots, tx } from './test-fixtures.ts';
import type { ChartWrite } from './writes.ts';

const t = (id: string, tags: string[]): Transaction => ({
	...tx(id, '2026-11-01', [
		['cash', -10000],
		['food', 10000]
	]),
	tags
});
const chart = buildChart(
	[...roots, account('cash', 'asset', 'asset'), account('food', 'expense', 'expense')],
	[
		opening('cash', 500000),
		t('a', ['christmas', 'house']),
		t('b', ['chirstmas']),
		t('c', ['chirstmas', 'christmas', 'gifts']),
		t('d', [])
	]
);
const later = new Date('2026-11-10T08:00:00Z');
const tagsOf = (writes: ChartWrite[]) =>
	Object.fromEntries(
		writes.map((w) => [w.id, w.op === 'setTransaction' ? w.data.tags : 'deleted'])
	);

describe('tagCounts', () => {
	it('lists every tag with how many Transactions use it, by name', () => {
		expect(tagCounts(chart)).toEqual([
			{ tag: 'chirstmas', count: 2 },
			{ tag: 'christmas', count: 2 },
			{ tag: 'gifts', count: 1 },
			{ tag: 'house', count: 1 }
		]);
	});
});

describe('planRenameTag', () => {
	it('rewrites only the Transactions with the tag, normalising the new name', () => {
		const writes = planRenameTag(chart, 'house', 'Home Reno', { now: later });
		expect(tagsOf(writes)).toEqual({ a: ['christmas', 'home-reno'] });
		expect(writes[0]).toMatchObject({ data: { description: 'a', updatedAt: later } });
	});

	it('merges into an existing tag without leaving a duplicate, keeping its place', () => {
		const writes = planRenameTag(chart, 'chirstmas', 'christmas', { now: later });
		expect(tagsOf(writes)).toEqual({ b: ['christmas'], c: ['christmas', 'gifts'] });
	});

	it('refuses an empty or unchanged name', () => {
		expect(() => planRenameTag(chart, 'house', ' !! ', { now: later })).toThrow(/name/i);
		expect(() => planRenameTag(chart, 'house', 'House', { now: later })).toThrow(/already/i);
	});
});

describe('planRemoveTag', () => {
	it('takes the tag off every Transaction that has it', () => {
		expect(tagsOf(planRemoveTag(chart, 'christmas', { now: later }))).toEqual({
			a: ['house'],
			c: ['chirstmas', 'gifts']
		});
	});
});
