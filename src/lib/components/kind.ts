// How each derived Transaction kind is labelled and coloured, shared by the form and the Journal.
import type { TransactionKind } from '#lib/domain/index.ts';

export const KIND: Record<TransactionKind, { label: string; style: string }> = {
	expense: { label: 'Expense', style: 'bg-rose-100 text-rose-800' },
	income: { label: 'Income', style: 'bg-emerald-100 text-emerald-800' },
	transfer: { label: 'Transfer', style: 'bg-sky-100 text-sky-800' },
	'income-and-expense': { label: 'Income and Expense', style: 'bg-violet-100 text-violet-800' }
};
