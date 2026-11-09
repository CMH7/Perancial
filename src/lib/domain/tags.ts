// The Tags screen: every tag with its use count, and renaming, merging and removing tags across
// every Transaction. Pure TypeScript, no Firebase imports.
import type { Chart } from './chart.ts';
import type { Transaction } from './schemas.ts';
import { normalizeTag } from './transactions.ts';
import type { ChartWrite } from './writes.ts';

export type TagCount = { tag: string; count: number };

/** Every tag in use, by name, with how many Transactions carry it. */
export function tagCounts(chart: Chart): TagCount[] {
	const counts = new Map<string, number>();
	for (const tx of chart.transactions())
		for (const tag of tx.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	return [...counts]
		.map(([tag, count]) => ({ tag, count }))
		.sort((a, b) => a.tag.localeCompare(b.tag));
}

/** Rewrites every Transaction carrying `tag` with new tags. */
function rewriteTagged(
	chart: Chart,
	tag: string,
	retag: (tags: string[]) => string[],
	now: Date
): ChartWrite[] {
	return chart
		.transactions()
		.filter((tx) => tx.tags.includes(tag))
		.map((tx: Transaction): ChartWrite => {
			const { id, ...data } = tx;
			return { op: 'setTransaction', id, data: { ...data, tags: retag(tx.tags), updatedAt: now } };
		});
}

/** Renames a tag everywhere. Renaming to a tag already in use merges the two. */
export function planRenameTag(
	chart: Chart,
	from: string,
	to: string,
	{ now }: { now: Date }
): ChartWrite[] {
	const name = normalizeTag(to);
	if (!name) throw new Error('Give the tag a name: letters, digits or hyphens');
	if (name === from) throw new Error(`It is already called #${from}`);
	return rewriteTagged(
		chart,
		from,
		(tags) => [...new Set(tags.map((t) => (t === from ? name : t)))],
		now
	);
}

/** Takes a tag off every Transaction that has it. */
export function planRemoveTag(chart: Chart, tag: string, { now }: { now: Date }): ChartWrite[] {
	return rewriteTagged(chart, tag, (tags) => tags.filter((t) => t !== tag), now);
}
