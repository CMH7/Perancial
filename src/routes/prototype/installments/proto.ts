// PROTOTYPE, throwaway ("Installments screens" ticket): stub Installment Plans taken from the
// owner's Google Sheet, plus the derived numbers every variant shows. Nothing is saved.
import { formatAmount } from '#lib/domain/money.ts';

export const TODAY = '2026-11-10';
export const peso = (c: number) => formatAmount(c);

export type Additional = { description: string; amount: number };
export type RowState = 'before' | 'unpaid' | 'partly' | 'paid';
export type Row = {
	n: number;
	date: string;
	principal: number;
	interest: number;
	additionals: Additional[];
	state: RowState;
	/** What linked Transactions add up to (stub). */
	paid: number;
	payments: { date: string; description: string; amount: number }[];
};
export type Plan = {
	id: string;
	kind: 'lender' | 'internal';
	title: string;
	tags: string[];
	purchaseDate: string;
	entry: 'flat' | 'varied';
	repaidAccount: string;
	payingAccount: string;
	interestAccount?: string;
	feesAccount?: string;
	rows: Row[];
};

const c = (pesos: number) => Math.round(pesos * 100);
const addMonths = (iso: string, n: number, day: number) => {
	const [y, m] = iso.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1 + n, 1));
	const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
	return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
};

/** Flat rows: amount ÷ count, remainder in the last row's principal. */
export function flat(amount: number, count: number, first: string, day: number, interest = 0) {
	const each = Math.floor(amount / count);
	return Array.from({ length: count }, (_, i) => ({
		n: i + 1,
		date: addMonths(first, i, day),
		principal: i === count - 1 ? amount - each * (count - 1) : each,
		interest,
		additionals: [] as Additional[]
	}));
}

type Base = Omit<Row, 'state' | 'paid' | 'payments'>;
export function track(
	rows: Base[],
	trackedFrom: number,
	paidUpTo: number,
	partly?: [number, number]
): Row[] {
	return rows.map((r) => {
		const total = rowTotal(r);
		if (r.n < trackedFrom) return { ...r, state: 'before', paid: 0, payments: [] };
		if (r.n <= paidUpTo)
			return {
				...r,
				state: 'paid',
				paid: total,
				payments: [{ date: r.date, description: 'Card billing', amount: total }]
			};
		if (partly && partly[0] === r.n)
			return {
				...r,
				state: 'partly',
				paid: partly[1],
				payments: [{ date: TODAY, description: 'Part payment', amount: partly[1] }]
			};
		return { ...r, state: 'unpaid', paid: 0, payments: [] };
	});
}

const claudeP = [
	0, 918.74, 931.8, 945.05, 958.48, 972.11, 985.93, 999.95, 1014.16, 1028.58, 1043.2, 1058.03,
	1073.04
];
const claudeI = [
	152.63, 169.59, 156.53, 143.28, 129.85, 116.22, 102.4, 88.38, 74.17, 59.75, 45.13, 30.3, 15.29
];

export const PLANS: Plan[] = [
	{
		id: 'claude',
		kind: 'lender',
		title: 'Claude',
		tags: ['claude'],
		purchaseDate: '2026-01-12',
		entry: 'varied',
		repaidAccount: 'Liabilities › BPI › Claude',
		payingAccount: 'Assets › BPI Savings',
		interestAccount: 'Expenses › Finance charges',
		feesAccount: 'Expenses › Finance charges',
		rows: track(
			claudeP.map((p, i) => ({
				n: i,
				date: addMonths('2026-02-09', i, 9),
				principal: c(p),
				interest: c(claudeI[i]),
				additionals: i === 0 ? [{ description: 'Processing Fee', amount: c(250) }] : []
			})),
			9,
			8
		)
	},
	{
		id: 'jcb',
		kind: 'lender',
		title: 'ANV15-52-572T (RCBC JCB)',
		tags: ['anv15-jcb'],
		purchaseDate: '2026-08-24',
		entry: 'flat',
		repaidAccount: 'Liabilities › RCBC JCB › ANV15 JCB',
		payingAccount: 'Liabilities › RCBC JCB › Card spending',
		interestAccount: 'Expenses › Finance charges',
		feesAccount: 'Expenses › Finance charges',
		rows: track(flat(c(45999), 12, '2026-09-15', 15), 2, 2)
	},
	{
		id: 'visa',
		kind: 'lender',
		title: 'ANV15-52-572T (RCBC VISA)',
		tags: ['anv15-rcbc-visa'],
		purchaseDate: '2026-08-24',
		entry: 'flat',
		repaidAccount: 'Liabilities › RCBC VISA › ANV15 VISA',
		payingAccount: 'Liabilities › RCBC VISA › Card spending',
		interestAccount: 'Expenses › Finance charges',
		feesAccount: 'Expenses › Finance charges',
		rows: track(flat(c(28000), 12, '2026-11-15', 15), 1, 0)
	},
	{
		id: 'ub',
		kind: 'lender',
		title: 'UB Paydirect (Helping Babu)',
		tags: ['helping-babu'],
		purchaseDate: '2026-09-15',
		entry: 'flat',
		repaidAccount: 'Liabilities › UB Paydirect',
		payingAccount: 'Assets › UB Savings',
		interestAccount: 'Expenses › Finance charges',
		feesAccount: 'Expenses › Finance charges',
		rows: track(flat(c(6500), 5, '2026-11-30', 30), 1, 0)
	},
	{
		id: 'nitro',
		kind: 'internal',
		title: 'Nitro 5 laptop',
		tags: ['nitro-5'],
		purchaseDate: '2026-09-20',
		entry: 'flat',
		repaidAccount: 'Assets › Personal Loan money',
		payingAccount: 'Assets › BPI Savings',
		rows: track(flat(c(52000), 12, '2026-10-30', 30, c(100)), 1, 0, [1, c(2000)])
	}
];

export function rowAdditionals(r: Pick<Row, 'additionals'>) {
	return r.additionals.reduce((s, a) => s + a.amount, 0);
}
export function rowTotal(r: Pick<Row, 'principal' | 'interest' | 'additionals'>) {
	return r.principal + r.interest + rowAdditionals(r);
}
export const rowLeft = (r: Row) =>
	r.state === 'before' || r.state === 'paid' ? 0 : Math.max(rowTotal(r) - r.paid, 0);
export const isOverdue = (r: Row) =>
	(r.state === 'unpaid' || r.state === 'partly') && r.date < TODAY;

export function summary(p: Plan) {
	const sum = (f: (r: Row) => number, rows = p.rows) => rows.reduce((s, r) => s + f(r), 0);
	const tracked = p.rows.filter((r) => r.state !== 'before');
	const before = p.rows.filter((r) => r.state === 'before');
	const done = (r: Row) => r.state === 'paid' || r.state === 'before';
	const next = tracked.find((r) => r.state === 'unpaid' || r.state === 'partly');
	return {
		amount: sum((r) => r.principal),
		grandTotal: sum(rowTotal),
		balance: sum(rowLeft, tracked),
		paidRows: p.rows.filter(done).length,
		rowCount: p.rows.length,
		next,
		overdue: tracked.filter(isOverdue),
		interest: {
			scheduled: sum((r) => r.interest),
			paid: sum((r) => r.interest, p.rows.filter(done)),
			before: sum((r) => r.interest, before)
		},
		additionals: {
			scheduled: sum(rowAdditionals),
			paid: sum(rowAdditionals, p.rows.filter(done)),
			before: sum(rowAdditionals, before)
		},
		unpaidPrincipal: sum((r) => (r.state === 'paid' ? 0 : r.principal), tracked)
	};
}

export const shortDate = (iso: string) =>
	new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});

export const STATE_LABEL: Record<RowState, string> = {
	before: 'Before tracking',
	unpaid: 'Unpaid',
	partly: 'Partly paid',
	paid: 'Paid'
};
