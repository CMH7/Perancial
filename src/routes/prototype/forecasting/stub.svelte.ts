// PROTOTYPE (throwaway, never merge): in-memory Forecast for one Cut-off with made-up data.
// Nothing here is real money; nothing is saved. Figures follow the Forecasting map's decisions.

export type Acc = { id: string; name: string; balanceToday: number; funding: boolean };
export type Inflow = {
	id: string;
	label: string;
	account: string;
	expected: string;
	amount: number;
	additional: number;
	received: number;
	receivedOn?: string;
	late?: boolean;
};
export type Source = { account: string; amount: number; paid: number; suggested?: boolean };
export type Charge = { label: string; amount: number; additional: number; status: string; recorded?: string };
export type Unplanned = { id: string; account: string; label: string; date: string; amount: number };
export type Outflow = {
	id: string;
	section: string;
	label: string;
	due: string;
	amount: number;
	additional: number;
	less: number;
	sources: Source[];
	kind?: 'transfer' | 'liability';
	to?: string;
	ealloc?: { forLabel: string; forDue: string; cutoff: string };
	allocatedIn?: string;
	carried?: boolean;
	breakdown?: Charge[];
	usualAccount?: string;
	plan: string;
};

export const OWNER_SECTIONS = ['Important', 'Internal Transfers'];

export const f = $state({
	cutoff: '2026-11-15',
	accounts: [
		{ id: 'payroll', name: 'Bank A › Payroll', balanceToday: 1_240, funding: true },
		{ id: 'everyday', name: 'Bank B › Everyday', balanceToday: 2_310.5, funding: true },
		{ id: 'reserve', name: 'Bank B › Reserve', balanceToday: 3_000, funding: true },
		{ id: 'savings', name: 'Savings', balanceToday: 18_400, funding: true },
		{ id: 'ewallet', name: 'E-wallet', balanceToday: 420, funding: false }
	] as Acc[],
	inflows: [
		{ id: 'i1', label: 'Pay (Employer)', account: 'payroll', expected: '2026-11-15', amount: 20_000, additional: 0, received: 20_000, receivedOn: '2026-11-13' },
		{ id: 'i2', label: 'Repayment from Friend A', account: 'ewallet', expected: '2026-11-15', amount: 1_200, additional: 0, received: 0 },
		{ id: 'i3', label: 'Repayment from Relative', account: 'everyday', expected: '2026-10-30', amount: 2_000, additional: 0.1, received: 0, late: true }
	] as Inflow[],
	outflows: [
		{ id: 'o0', section: 'Overdue', label: 'Internet bill', due: '2026-11-08', amount: 1_500, additional: 0, less: 0, carried: true, plan: '/scheduled', sources: [{ account: 'everyday', amount: 1_500, paid: 0 }] },
		{ id: 'o1', section: 'Important', label: 'Savings deposit', due: '2026-11-16', amount: 3_000, additional: 0, less: 0, kind: 'transfer', to: 'savings', plan: '/scheduled', sources: [{ account: 'everyday', amount: 3_000, paid: 0 }] },
		{ id: 'o2', section: 'Important', label: 'Allowance (parent)', due: '2026-11-16', amount: 4_000, additional: 15, less: 0, plan: '/scheduled', sources: [{ account: 'everyday', amount: 4_015, paid: 4_015 }] },
		{ id: 'o3', section: 'Internal Transfers', label: 'Move pay to Everyday', due: '2026-11-16', amount: 15_000, additional: 0, less: 0, kind: 'transfer', to: 'everyday', plan: '/scheduled', sources: [{ account: 'payroll', amount: 15_000, paid: 15_000 }] },
		{ id: 'o4', section: 'Card X', label: 'Card X payment', due: '2026-11-25', amount: 4_948, additional: 5, less: 0, kind: 'liability', plan: '/scheduled',
			breakdown: [
				{ label: '[Ins 3/12] Laptop', amount: 2_000, additional: 0, status: 'Billed' },
				{ label: '[Subs-m] Music', amount: 150, additional: 5, status: 'Billed' },
				{ label: "Friend A's gadget (owed back)", amount: 1_200, additional: 0, status: 'Billed' },
				{ label: 'Buffet (2 × ₱799)', amount: 1_598, additional: 0, status: 'Recorded', recorded: '2026-11-09' }
			],
			sources: [{ account: 'everyday', amount: 3_753, paid: 0 }, { account: 'ewallet', amount: 1_200, paid: 0, suggested: true }] },
		{ id: 'o5', section: 'Payable to Relative B', label: 'Payment to Relative B', due: '2026-11-20', amount: 3_000, additional: 0, less: 0, kind: 'liability', allocatedIn: '30 Oct', plan: '/scheduled',
			breakdown: [{ label: 'Insurance premium (on their card)', amount: 3_000, additional: 0, status: 'Billed' }],
			sources: [{ account: 'reserve', amount: 3_000, paid: 0 }] },
		{ id: 'o6', section: 'Others', label: '[Ins 1/5] Gadget loan', due: '2026-11-28', amount: 1_300, additional: 0, less: 0, plan: '/installments', sources: [{ account: 'everyday', amount: 800, paid: 800 }, { account: 'savings', amount: 500, paid: 0 }] },
		{ id: 'o7', section: 'Others', label: 'Water bill', due: '2026-11-22', amount: 450, additional: 0, less: 0, usualAccount: 'Bank C › Old account', plan: '/scheduled', sources: [] }
	] as Outflow[],
	/** Recorded Transactions from a Funding Account in the funded window that pay no Occurrence or Row. */
	unplanned: [
		{ id: 'u1', account: 'everyday', label: 'Groceries', date: '2026-11-17', amount: 850 }
	] as Unplanned[]
});

/** Next Cut-off's Outflows that could be allocated early. */
export const laterOutflows = $state([
	{ id: 'n1', label: 'Insurance (self)', due: '2026-12-05', total: 2_500 },
	{ id: 'n2', label: '[Ins 4/12] Laptop', due: '2026-12-10', total: 2_000 },
	{ id: 'n3', label: 'Rent share', due: '2026-12-01', total: 6_000 }
]);

export const accName = (id: string) => f.accounts.find((a) => a.id === id)?.name ?? id;
export const total = (o: Outflow) => o.amount + o.additional;
export const funded = (o: Outflow) => o.sources.reduce((s, x) => s + x.amount, 0);
export const unfunded = (o: Outflow) => Math.max(0, total(o) - funded(o));
export const paidOf = (o: Outflow) => o.sources.reduce((s, x) => s + x.paid, 0);
export const status = (o: Outflow) =>
	paidOf(o) >= total(o) ? 'Paid' : paidOf(o) > 0 ? 'Partly Paid' : 'Unpaid';
export const peso = (n: number) =>
	(n < 0 ? '-₱' : '₱') +
	Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** A source on an Account that isn't a Funding Account counts as Unfunded. */
export const sourceOk = (s: Source) => !!f.accounts.find((a) => a.id === s.account)?.funding;

export type Row = Acc & {
	inflows: Inflow[];
	transferIn: number;
	allocatedFor: number;
	inn: number;
	fexp: number;
	plannedLeft: number;
	received: number;
	paid: number;
	left: number;
	fealloc: number;
	ealloc: number;
};

export function rows(): Row[] {
	return f.accounts
		.filter((a) => a.funding || f.inflows.some((i) => i.account === a.id))
		.map((a) => {
			const inflows = f.inflows.filter((i) => i.account === a.id);
			const transfers = f.outflows.filter((o) => o.kind === 'transfer' && o.to === a.id && !o.ealloc);
			const transferIn = transfers.reduce((s, o) => s + o.amount, 0);
			const transferInDone = transfers.reduce((s, o) => s + paidOf(o), 0);
			const allocatedFor = f.outflows
				.filter((o) => o.allocatedIn)
				.flatMap((o) => o.sources)
				.filter((s) => s.account === a.id)
				.reduce((s, x) => s + x.amount, 0);
			const srcs = f.outflows
				.flatMap((o) => o.sources.map((s) => ({ o, s })))
				.filter((x) => x.s.account === a.id);
			const inn = inflows.reduce((s, i) => s + i.amount + i.additional, 0) + transferIn + allocatedFor;
			const fexp = srcs.reduce((s, x) => s + x.s.amount, 0);
			const received = inflows.reduce((s, i) => s + i.received, 0) + transferInDone + allocatedFor;
			const unplanned = f.unplanned.filter((u) => u.account === a.id).reduce((s, u) => s + u.amount, 0);
			const paid = srcs.reduce((s, x) => s + x.s.paid, 0) + unplanned;
			const ea = srcs.filter((x) => x.o.ealloc);
			return {
				...a,
				inflows,
				transferIn,
				allocatedFor,
				inn,
				fexp,
				plannedLeft: inn - fexp,
				received,
				paid,
				left: received - paid,
				fealloc: ea.reduce((s, x) => s + x.s.amount, 0),
				ealloc: ea.reduce((s, x) => s + x.s.paid, 0)
			};
		});
}

export function sections() {
	const liab = [
		...new Set(f.outflows.filter((o) => o.kind === 'liability').map((o) => o.section))
	].sort();
	return ['Overdue', ...OWNER_SECTIONS, ...liab, 'Others']
		.map((name) => ({ name, items: f.outflows.filter((o) => o.section === name) }))
		.filter((s) => s.items.length);
}

export function totals() {
	const r = rows().filter((x) => x.funding);
	const unf = f.outflows.reduce(
		(s, o) =>
			s + unfunded(o) + o.sources.filter((x) => !sourceOk(x)).reduce((t, x) => t + x.amount, 0),
		0
	);
	return {
		unfunded: unf,
		short: r.reduce((s, x) => s + Math.min(0, x.plannedLeft), 0),
		outflows: f.outflows.reduce((s, o) => s + total(o), 0),
		paid: f.outflows.reduce((s, o) => s + paidOf(o), 0)
	};
}

// Actions: stubs that only change memory.
export function recordAll(o: Outflow) {
	for (const s of o.sources) if (sourceOk(s)) s.paid = s.amount;
}
export function recordOne(s: Source) {
	if (sourceOk(s)) s.paid = s.amount;
}
export function addSource(o: Outflow, account: string) {
	o.sources.push({ account, amount: unfunded(o), paid: 0 });
}
/** "Bill with next payment": the charge leaves this card payment for the following one. */
export function billNext(o: Outflow, c: Charge) {
	o.breakdown = o.breakdown!.filter((x) => x !== c);
	o.amount -= c.amount + c.additional;
	const s = o.sources.find((x) => x.paid === 0);
	if (s) s.amount = Math.max(0, s.amount - c.amount - c.additional);
	movedCharges.push({ label: c.label, card: o.section, to: '10 Dec' });
}
export const movedCharges = $state<{ label: string; card: string; to: string }[]>([]);
export function useAsFunding(id: string) {
	const a = f.accounts.find((x) => x.id === id);
	if (a) a.funding = true;
}
export function allocateEarly(id: string, from: string) {
	const i = laterOutflows.findIndex((x) => x.id === id);
	if (i < 0) return;
	const [n] = laterOutflows.splice(i, 1);
	f.outflows.push({
		id: 'ea-' + n.id,
		section: 'Internal Transfers',
		label: `Reserve for ${n.label}`,
		due: '2026-11-16',
		amount: n.total,
		additional: 0,
		less: 0,
		kind: 'transfer',
		to: 'reserve',
		ealloc: { forLabel: n.label, forDue: n.due, cutoff: '30 Nov' },
		plan: '/scheduled',
		sources: [{ account: from, amount: n.total, paid: 0 }]
	});
}
export function undoAllocation(o: Outflow) {
	if (!o.ealloc || paidOf(o) > 0) return;
	f.outflows.splice(f.outflows.indexOf(o), 1);
	laterOutflows.push({
		id: o.id.slice(3),
		label: o.ealloc.forLabel,
		due: o.ealloc.forDue,
		total: o.amount
	});
}
export function shiftCutoff(step: number) {
	const [y, m, d] = f.cutoff.split('-').map(Number);
	let yy = y,
		mm = m,
		dd = 15;
	if (step > 0) {
		if (d === 15) dd = 30;
		else ((mm = m === 12 ? 1 : m + 1), (yy = m === 12 ? y + 1 : y));
	} else if (d === 15) {
		mm = m === 1 ? 12 : m - 1;
		yy = m === 1 ? y - 1 : y;
		dd = 30;
	}
	const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
	f.cutoff = `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
}
export const fmt = (d: string, year = false) =>
	new Date(d + 'T00:00:00Z').toLocaleDateString('en-PH', {
		day: 'numeric',
		month: 'short',
		...(year ? { year: 'numeric' } : {}),
		timeZone: 'UTC'
	});
/** The days a Cut-off's pay funds: from the day after it to the next Cut-off. */
export function fundedWindow(c: string) {
	const [y, m, d] = c.split('-').map(Number);
	if (d === 15) {
		const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
		return `16–${last} ${fmt(c).split(' ')[1]}`;
	}
	const ny = m === 12 ? y + 1 : y,
		nm = m === 12 ? 1 : m + 1;
	return `1–15 ${fmt(`${ny}-${String(nm).padStart(2, '0')}-01`).split(' ')[1]}`;
}
