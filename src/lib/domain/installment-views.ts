// What the Installments screen shows: the Plans list and the rows due by Cut-off.
// Pure TypeScript, no Firebase imports.
import type { Chart, IsoDate } from './chart.ts';
import { planSummary, rowStatuses, type PlanSummary, type RowStatus } from './installments.ts';
import type { Installment } from './schemas.ts';

/** The Cut-off a date falls in: days 1–15 on the 15th, the rest on the 30th (or February's last day). */
export function cutoffOf(date: IsoDate): IsoDate {
	const [y, m, d] = date.split('-').map(Number);
	const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
	const day = d <= 15 ? 15 : Math.min(30, last);
	return `${date.slice(0, 8)}${String(day).padStart(2, '0')}`;
}

export type InstallmentLine = { plan: Installment; summary: PlanSummary; overdue: boolean };

/** Every plan with its summary: overdue plans first, then by next date, finished plans last. */
export function plansList(
	chart: Chart,
	plans: Installment[],
	{ today }: { today: IsoDate }
): InstallmentLine[] {
	const lines = plans.map((plan) => {
		const summary = planSummary(chart, plan, { today });
		return { plan, summary, overdue: !!summary.next?.overdue };
	});
	const nextDate = (l: InstallmentLine) => l.summary.next?.row.date ?? '9999-12-31';
	return lines.sort(
		(a, b) =>
			Number(b.overdue) - Number(a.overdue) ||
			nextDate(a).localeCompare(nextDate(b)) ||
			a.plan.title.localeCompare(b.plan.title)
	);
}

/**
 * The Installments plan list narrowed for its pane: open plans still have a next row, done ones
 * don't; `q` matches the title or the repaid Account's name, ignoring case. Order is kept.
 */
export function filterPlansList(
	chart: Chart,
	lines: InstallmentLine[],
	{ show, q }: { show: 'open' | 'done' | 'all'; q: string }
): InstallmentLine[] {
	const needle = q.trim().toLowerCase();
	return lines.filter(
		(l) =>
			(show === 'all' || (show === 'open') === !!l.summary.next) &&
			(!needle ||
				[l.plan.title, chart.account(l.plan.accounts.repaid)?.name ?? ''].some((t) =>
					t.toLowerCase().includes(needle)
				))
	);
}

export type DueItem = {
	plan: Installment;
	status: RowStatus;
	/** The plan's last row number, for "#3 of 12". */
	of: number;
};
export type DueGroup = {
	/** `overdue`, or the Cut-off date. */
	key: 'overdue' | IsoDate;
	/** What is left on the group's rows. */
	total: number;
	items: DueItem[];
};

/**
 * Tracked rows not yet Paid, from every plan: an Overdue group first, then one group per Cut-off
 * in date order. With `until`, rows dated after it are left out (overdue rows always show).
 */
export function dueByCutoff(
	chart: Chart,
	plans: Installment[],
	{ today, until }: { today: IsoDate; until?: IsoDate }
): DueGroup[] {
	const items: DueItem[] = plans.flatMap((plan) =>
		rowStatuses(chart, plan, { today })
			.filter((s) => s.state === 'unpaid' || s.state === 'partly-paid')
			.filter((s) => s.overdue || !until || s.row.date <= until)
			.map((status) => ({ plan, status, of: plan.rows.at(-1)!.n }))
	);
	items.sort(
		(a, b) =>
			a.status.row.date.localeCompare(b.status.row.date) || a.plan.title.localeCompare(b.plan.title)
	);
	const groups = new Map<string, DueItem[]>();
	for (const item of items) {
		const key = item.status.overdue ? 'overdue' : cutoffOf(item.status.row.date);
		groups.set(key, [...(groups.get(key) ?? []), item]);
	}
	return [...groups.entries()]
		.sort(([a], [b]) => (a === 'overdue' ? -1 : b === 'overdue' ? 1 : a.localeCompare(b)))
		.map(([key, list]) => ({
			key,
			total: list.reduce((s, i) => s + i.status.remaining, 0),
			items: list
		}));
}
