// The Accounts page tree: one Root Account's descendants as flat rows, depth-first, with closed
// Group Accounts' children left out and an optional name filter.
import type { Chart } from './chart.ts';
import type { Account } from './schemas.ts';

export type TreeRow = {
	account: Account;
	/** 0 for the Root Account's children. */
	depth: number;
	/** Has children to show (after the archived and name filters). */
	expandable: boolean;
	/** Its children follow it in the rows. */
	open: boolean;
};

export type TreeOptions = {
	/** Whether a Group Account is open; ignored while a filter is set (matches always show). */
	isOpen: (id: string) => boolean;
	showArchived?: boolean;
	/** Case-insensitive part of an Account name. Blank shows every Account. */
	filter?: string;
};

export function accountTreeRows(
	chart: Chart,
	rootId: string,
	{ isOpen, showArchived = false, filter = '' }: TreeOptions
): TreeRow[] {
	const needle = filter.trim().toLowerCase();
	const named = (a: Account) => a.name.toLowerCase().includes(needle);
	const rows: TreeRow[] = [];

	/** Children to show; under a matching Account everything shows. */
	const visible = (id: string, inMatch: boolean): Account[] =>
		chart
			.children(id, { showArchived })
			.filter((a) => !needle || inMatch || named(a) || visible(a.id, false).length > 0);

	function walk(id: string, depth: number, inMatch: boolean) {
		for (const a of visible(id, inMatch)) {
			const below = inMatch || (!!needle && named(a));
			const expandable = visible(a.id, below).length > 0;
			const open = expandable && (needle ? true : isOpen(a.id));
			rows.push({ account: a, depth, expandable, open });
			if (open) walk(a.id, depth + 1, below);
		}
	}

	walk(rootId, 0, false);
	return rows;
}

/** Every Group Account under the Root Account (archived ones included), for "expand all". */
export function treeGroupIds(chart: Chart, rootId: string): string[] {
	return chart
		.subtree(rootId)
		.filter((a) => a.id !== rootId && chart.isGroup(a.id))
		.map((a) => a.id);
}
