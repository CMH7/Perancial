// The searchable Account picker: which Accounts it lists, and search, filter and sort over them.
// Pure TypeScript; the component only draws what these return.
import { ACCOUNT_TYPE_GUIDE } from './account-types.ts';
import type { Chart, IsoDate } from './chart.ts';
import type { AccountType } from './schemas.ts';

export type PickerItem = {
	id: string;
	name: string;
	/** The Groups above it, Root Account left out ("" for a top-level Account). */
	path: string;
	/** The full path shown once picked. */
	label: string;
	type: AccountType;
	balance: number;
	group: boolean;
	/** Date of the latest Transaction on the Account itself, null when never used. */
	lastUsed: IsoDate | null;
	/** Position in the chart (Account Types in the usual order, then manual order). */
	order: number;
};

export type PickerSort = 'path' | 'name' | 'balance' | 'recent';
export const PICKER_SORTS: { key: PickerSort; label: string }[] = [
	{ key: 'path', label: 'Path' },
	{ key: 'name', label: 'Name' },
	{ key: 'balance', label: 'Balance' },
	{ key: 'recent', label: 'Recent' }
];

/** Every Account's place in the chart: depth-first from the Root Accounts, manual order. */
function chartOrder(chart: Chart): Map<string, number> {
	const order = new Map<string, number>();
	const walk = (id: string) => {
		order.set(id, order.size);
		for (const c of chart.children(id, { showArchived: true })) walk(c.id);
	};
	const roots = chart.all().filter((a) => a.parentId === null);
	for (const { type } of ACCOUNT_TYPE_GUIDE)
		for (const r of roots.filter((a) => a.type === type)) walk(r.id);
	return order;
}

/** Latest Transaction date per Account, from the Entries themselves. */
function lastUse(chart: Chart): Map<string, IsoDate> {
	const last = new Map<string, IsoDate>();
	for (const tx of chart.transactions()) {
		if (!tx.date) continue;
		for (const e of tx.entries) {
			const seen = last.get(e.accountId);
			if (!seen || tx.date > seen) last.set(e.accountId, tx.date);
		}
	}
	return last;
}

/** The picker's rows for these Account ids (ids the chart doesn't hold are skipped). */
export function pickerItems(
	chart: Chart,
	ids: readonly string[],
	{ today }: { today: IsoDate }
): PickerItem[] {
	const order = chartOrder(chart);
	const last = lastUse(chart);
	return ids.flatMap((id) => {
		const a = chart.account(id);
		if (!a) return [];
		const above = chart
			.path(id)
			.slice(1, -1)
			.map((p) => p.name)
			.join(' › ');
		const name = a.name + (a.archived ? ' (archived)' : '');
		return [
			{
				id,
				name,
				path: above,
				label: above ? `${above} › ${name}` : name,
				type: a.type,
				balance: chart.balance(id, today),
				group: chart.isGroup(id),
				lastUsed: last.get(id) ?? null,
				order: order.get(id) ?? Number.MAX_SAFE_INTEGER
			}
		];
	});
}

/**
 * Search, filter and sort. Every word typed must appear somewhere in the full path. Path sort
 * keeps chart order (so Account Types stay together); the others sort the whole list, ties in
 * chart order.
 */
export function pickAccounts(
	items: readonly PickerItem[],
	{
		query = '',
		type = 'all',
		sort = 'path'
	}: { query?: string; type?: AccountType | 'all'; sort?: PickerSort }
): PickerItem[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	const byOrder = (a: PickerItem, b: PickerItem) => a.order - b.order;
	const compare: Record<PickerSort, (a: PickerItem, b: PickerItem) => number> = {
		path: byOrder,
		name: (a, b) => a.name.localeCompare(b.name) || byOrder(a, b),
		balance: (a, b) => b.balance - a.balance || byOrder(a, b),
		recent: (a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || byOrder(a, b)
	};
	return items
		.filter((i) => type === 'all' || i.type === type)
		.filter((i) => {
			const text = i.label.toLowerCase();
			return words.every((w) => text.includes(w));
		})
		.sort(compare[sort]);
}
