// PROTOTYPE ONLY: what the Accounts page hands each layout variant.
import type { Account, AccountType, Chart } from '#lib/domain/index.ts';

export type Dialog = 'create' | 'edit' | 'move' | 'archive' | 'delete';

export type VariantProps = {
	chart: Chart;
	account: Account;
	path: Account[];
	root: Account | undefined;
	children: Account[];
	group: boolean;
	showArchived: boolean;
	href: (accountId: string) => string;
	open: (dialog: Dialog) => void;
};

/** One accent per Account Type, used by the prototype variants only. */
export const TYPE_TONE: Record<AccountType, { dot: string; soft: string; text: string; bar: string }> =
	{
		asset: { dot: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
		liability: { dot: 'bg-rose-500', soft: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500' },
		equity: { dot: 'bg-slate-500', soft: 'bg-slate-100', text: 'text-slate-700', bar: 'bg-slate-500' },
		income: { dot: 'bg-sky-500', soft: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-500' },
		expense: { dot: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' }
	};
