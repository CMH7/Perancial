// The Forecast for one Cut-off: its Inflows, the Outflows they fund, and which Funding Accounts pay
// each one (the Forecasting map, CMH7/Perancial#91; ADR 0005). Everything here is derived from
// plans, Transactions and the small Forecast documents. Pure TypeScript, no Firebase imports.
import type { AccountUser } from './account-actions.ts';
import type { Chart, IsoDate } from './chart.ts';
import { cutoffOf } from './installment-views.ts';
import { rowStatuses, rowTotal } from './installments.ts';
import { paymentsFor, txTotal, type PaidStatus } from './payable.ts';
import { addDays, occurrenceStatus, occurrencesOf, type Occurrence } from './scheduled.ts';
import type {
	Account,
	Forecast,
	ForecastSection,
	ForecastSettingsDoc,
	Installment,
	PaidLink,
	PayingSource,
	Scheduled,
	Transaction
} from './schemas.ts';
import type { ChartWrite } from './writes.ts';

// ---------------------------------------------------------------------------------------------
// Cut-off windows

const parts = (d: IsoDate) => d.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) =>
	`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The Cut-off after this one: the 15th → the 30th (Feb's last day) → next month's 15th. */
export function nextCutoff(cutoff: IsoDate): IsoDate {
	const [y, m, d] = parts(cutoff);
	if (d === 15) return iso(y, m, Math.min(30, lastDay(y, m)));
	return m === 12 ? iso(y + 1, 1, 15) : iso(y, m + 1, 15);
}

/** The Cut-off before this one. */
export function previousCutoff(cutoff: IsoDate): IsoDate {
	const [y, m, d] = parts(cutoff);
	if (d !== 15) return iso(y, m, 15);
	const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
	return iso(py, pm, Math.min(30, lastDay(py, pm)));
}

export type DateRange = { from: IsoDate; to: IsoDate };

/** The days a Cut-off covers: 1–15 for the 15th, 16 to the month's end for the 30th. */
export function cutoffWindow(cutoff: IsoDate): DateRange {
	const [y, m, d] = parts(cutoff);
	return d === 15
		? { from: iso(y, m, 1), to: iso(y, m, 15) }
		: { from: iso(y, m, 16), to: iso(y, m, lastDay(y, m)) };
}

/** The days a Cut-off's pay funds: from the day after it until the next Cut-off. */
export const fundedWindow = (cutoff: IsoDate): DateRange => cutoffWindow(nextCutoff(cutoff));

/** The Cut-off whose pay funds an Outflow due on this date. */
export const fundingCutoffOf = (date: IsoDate): IsoDate => previousCutoff(cutoffOf(date));

/** The Forecast that opens by default: the next Cut-off on or after today. */
export const openingCutoff = (today: IsoDate): IsoDate => cutoffOf(today);

const inRange = (d: IsoDate, r: DateRange) => d >= r.from && d <= r.to;

// ---------------------------------------------------------------------------------------------
// Inputs and settings

export type ForecastInput = {
	chart: Chart;
	scheduled: Scheduled[];
	installments: Installment[];
	forecasts: Forecast[];
	/** The owner's Section lists; null until first saved (the defaults apply). */
	settings: ForecastSettingsDoc | null;
	today: IsoDate;
};

/** The starting Section lists, used until the owner saves their own. */
export const DEFAULT_FORECAST_SECTIONS: Pick<
	ForecastSettingsDoc,
	'inflowSections' | 'outflowSections'
> = {
	inflowSections: [
		{ id: 'pay', name: 'Pay' },
		{ id: 'savings', name: 'Savings' },
		{ id: 'loans', name: 'Loans' },
		{ id: 'repayments', name: 'Repayments' },
		{ id: 'others', name: 'Others' }
	],
	outflowSections: [
		{ id: 'important', name: 'Important' },
		{ id: 'internal-transfers', name: 'Internal Transfers' },
		{ id: 'others', name: 'Others' }
	]
};

const sectionLists = (input: ForecastInput) => input.settings ?? DEFAULT_FORECAST_SECTIONS;

const isAsset = (chart: Chart, id: string) => chart.account(id)?.type === 'asset';
const isAssetLeaf = (chart: Chart, id: string) => isAsset(chart, id) && !chart.isGroup(id);

// ---------------------------------------------------------------------------------------------
// Funding Accounts

/** Asset Leaves the plans pay from or pay into from Income: the very first Funding Accounts. */
function defaultFundingAccounts(input: ForecastInput): string[] {
	const { chart } = input;
	const out: string[] = [];
	const add = (id: string) => {
		const a = chart.account(id);
		if (a && !a.archived && isAssetLeaf(chart, id) && !out.includes(id)) out.push(id);
	};
	for (const plan of input.scheduled) {
		const v = plan.versions.at(-1)!;
		const from = v.lines.filter((l) => l.side === 'from');
		const to = v.lines.filter((l) => l.side === 'to' && !l.fee);
		if (to.some((l) => !isAsset(chart, l.accountId)) || plan.allocates)
			from.forEach((l) => add(l.accountId));
		if (from.some((l) => chart.account(l.accountId)?.type === 'income'))
			to.forEach((l) => add(l.accountId));
	}
	for (const p of input.installments) add(p.accounts.paying);
	return out;
}

/** A Cut-off's Funding Accounts: its own document, else the latest earlier one, else defaults. */
export function fundingAccountsFor(
	input: ForecastInput,
	cutoff: IsoDate
): { ids: string[]; stored: boolean } {
	const own = input.forecasts.find((f) => f.id === cutoff);
	if (own) return { ids: [...own.fundingAccounts], stored: true };
	const earlier = input.forecasts
		.filter((f) => f.id < cutoff)
		.sort((a, b) => b.id.localeCompare(a.id))[0];
	return {
		ids: earlier ? [...earlier.fundingAccounts] : defaultFundingAccounts(input),
		stored: false
	};
}

// ---------------------------------------------------------------------------------------------
// Items: Inflows and Outflows

export type SectionRef = {
	/** Stable key for grouping: `overdue`, `owner:<id>`, `liability:<accountId>`, `derived:<name>`. */
	key: string;
	name: string;
	kind: 'overdue' | 'owner' | 'liability' | 'derived';
};

export type ResolvedSource = PayingSource & {
	/** Paid so far from this Account by the Outflow's paying Transactions. */
	paid: number;
	/** False when the Account isn't one of this Cut-off's Funding Accounts: it counts as Unfunded. */
	valid: boolean;
	/** Carried over: what this source had paid before, not part of `amount` here. */
	priorPaid?: number;
};

export type Charge = {
	key: string;
	label: string;
	/** The date it is billed on (`billOn` for a recorded charge billed later). */
	date: IsoDate;
	amount: number;
	from: 'scheduled' | 'installment' | 'transaction';
	link?: PaidLink;
	txId?: string;
};

export type ForecastOutflow = {
	key: string;
	link: PaidLink;
	label: string;
	/** The rule date: the Outflow's identity. */
	due: IsoDate;
	/** Where it falls now; decides its Cut-off. */
	date: IsoDate;
	/** Total minus additional Fees: what goes to the payee plus any less Fee. */
	amount: number;
	additional: number;
	less: number;
	/** Cash leaving the owner's Accounts: amount + additional. */
	total: number;
	/** The amount varies and none was set for this Occurrence. */
	varies: boolean;
	kind: 'expense' | 'transfer' | 'liability';
	/** The owner's Asset a transfer moves money into. */
	transferTo?: string;
	/** The Liability a payment pays, for a Liability Section. */
	liabilityId?: string;
	charges?: Charge[];
	section: SectionRef;
	sources: ResolvedSource[];
	/** Default Accounts that aren't Funding Accounts in this Cut-off ("usually paid from"). */
	usualAccounts: string[];
	unfunded: number;
	status: PaidStatus['status'];
	overdue: boolean;
	paid: number;
	remaining: number;
	/** This transfer is an Early allocation for that Outflow. */
	ealloc?: PaidLink;
	/** The Cut-off whose Early allocation set this Outflow's money aside. */
	allocatedIn?: IsoDate;
	/** How much of that Early allocation's transfer has been recorded (money in the reserve). */
	allocatedPaid?: number;
	/** `in`: carried into this Forecast; a date: carried out to that Cut-off's Forecast. */
	carried?: 'in' | IsoDate;
	plan: Scheduled | Installment;
};

export type ForecastInflow = {
	key: string;
	link: PaidLink;
	label: string;
	accountId: string;
	/** The expected (rule) date: decides its Cut-off. */
	due: IsoDate;
	date: IsoDate;
	amount: number;
	additional: number;
	total: number;
	varies: boolean;
	received: number;
	receivedOn?: IsoDate;
	status: PaidStatus['status'];
	/** Not received by the end of its own Cut-off; shown in the Forecast for today. */
	late: boolean;
	section: SectionRef;
	plan: Scheduled;
};

type Classified =
	| { kind: 'inflow' }
	| { kind: 'outflow' }
	| { kind: 'charge'; liabilityId: string }
	| { kind: 'none' };

/**
 * What an Occurrence is to a Forecast with these Funding Accounts. Money from a Funding Account is
 * an Outflow; money into an Asset from anywhere else (Income, a Liability, an Asset tracking what
 * someone owes) is an Inflow; spending on a Liability is a charge, paid later with that Liability.
 */
function classify(chart: Chart, occ: Occurrence, funding: Set<string>): Classified {
	const from = occ.version.lines.filter((l) => l.side === 'from');
	const to = occ.version.lines.filter((l) => l.side === 'to' && !l.fee);
	if (from.some((l) => funding.has(l.accountId))) return { kind: 'outflow' };
	if (to.some((l) => isAsset(chart, l.accountId))) return { kind: 'inflow' };
	if (from.some((l) => isAsset(chart, l.accountId))) return { kind: 'outflow' };
	const liability = from.find((l) => chart.account(l.accountId)?.type === 'liability');
	if (liability) return { kind: 'charge', liabilityId: liability.accountId };
	return { kind: 'none' };
}

const scheduledLink = (planId: string, due: IsoDate): PaidLink => ({
	plan: 'scheduled',
	planId,
	due
});
const keyOf = (l: PaidLink) => `${l.plan}:${l.planId}:${l.due}`;

/** From amounts on an Account in a Transaction (money leaving it). */
const outOf = (tx: Transaction, accountId: string) =>
	tx.entries.reduce((s, e) => s + (e.accountId === accountId && e.amount < 0 ? -e.amount : 0), 0);

function resolveSources(
	stored: PayingSource[] | undefined,
	defaults: PayingSource[],
	funding: Set<string>,
	payments: Transaction[]
): { sources: ResolvedSource[]; usualAccounts: string[] } {
	const picked = stored ?? defaults.filter((s) => funding.has(s.accountId));
	const usualAccounts = stored
		? []
		: defaults.filter((s) => !funding.has(s.accountId)).map((s) => s.accountId);
	// Paid per source: each Account's From amounts, filled in source order.
	const left = new Map<string, number>();
	for (const s of picked)
		if (!left.has(s.accountId))
			left.set(
				s.accountId,
				payments.reduce((t, tx) => t + outOf(tx, s.accountId), 0)
			);
	const sources = picked.map((s) => {
		const avail = left.get(s.accountId) ?? 0;
		const paid = Math.min(avail, s.amount);
		left.set(s.accountId, avail - paid);
		return { ...s, paid, valid: funding.has(s.accountId) };
	});
	return { sources, usualAccounts };
}

type Ctx = {
	input: ForecastInput;
	cutoff: IsoDate;
	funding: Set<string>;
	/** The Forecast whose funded window holds today: where late items carry. */
	current: IsoDate;
};

/** Every Occurrence of every plan whose current date falls in the range. */
const occurrencesIn = (plans: Scheduled[], range: DateRange) =>
	plans.flatMap((plan) => occurrencesOf(plan, range).map((occ) => ({ plan, occ })));

/** A Liability's payments: Occurrences paying it from an Asset, over a wide range. */
function paymentDates(ctx: Ctx, liabilityId: string, around: IsoDate): IsoDate[] {
	const { chart } = ctx.input;
	return occurrencesIn(ctx.input.scheduled, {
		from: addDays(around, -400),
		to: addDays(around, 400)
	})
		.filter(
			({ occ }) =>
				!occ.skipped &&
				occ.version.lines.some((l) => l.side === 'to' && !l.fee && l.accountId === liabilityId) &&
				occ.version.lines.some((l) => l.side === 'from' && isAsset(chart, l.accountId))
		)
		.map(({ occ }) => occ.date)
		.sort();
}

/** Charges on a Liability billed with the payment due on `date`: since the previous payment. */
function chargesFor(ctx: Ctx, liabilityId: string, date: IsoDate): Charge[] {
	const { chart, scheduled, installments } = ctx.input;
	const prev = paymentDates(ctx, liabilityId, date)
		.filter((d) => d < date)
		.at(-1);
	const range = { from: addDays(prev ?? addDays(date, -31), 1), to: date };
	const charges: Charge[] = [];

	for (const { plan, occ } of occurrencesIn(scheduled, range)) {
		if (occ.skipped) continue;
		const k = occ.version.lines.findIndex((l) => l.side === 'from' && l.accountId === liabilityId);
		if (k < 0 || occ.version.lines.some((l) => l.side === 'from' && isAsset(chart, l.accountId)))
			continue;
		const link = scheduledLink(plan.id, occ.due);
		charges.push({
			key: keyOf(link),
			label: occ.version.description,
			date: occ.date,
			amount: occ.amounts[k] ?? occ.total ?? 0,
			from: 'scheduled',
			link
		});
	}
	for (const plan of installments) {
		if (plan.accounts.paying !== liabilityId) continue;
		for (const row of plan.rows)
			if (row.n >= plan.trackedFrom && inRange(row.date, range)) {
				const link: PaidLink = { plan: 'installment', planId: plan.id, due: row.due };
				charges.push({
					key: keyOf(link),
					label: rowLabel(plan, row.n),
					date: row.date,
					amount: rowTotal(row),
					from: 'installment',
					link
				});
			}
	}
	for (const tx of chart.transactionsFor(liabilityId)) {
		// A recorded Transaction paying a Scheduled charge or Row is already listed as that item.
		if (tx.date === null || tx.pays) continue;
		const billed = tx.billOn ?? tx.date;
		const charged = outOf(tx, liabilityId);
		const repaid = tx.entries.some((e) => e.accountId === liabilityId && e.amount > 0);
		if (!inRange(billed, range) || charged === 0 || repaid) continue;
		charges.push({
			key: `transaction:${tx.id}`,
			label: tx.description,
			date: billed,
			amount: charged,
			from: 'transaction',
			txId: tx.id
		});
	}
	return charges.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

const rowLabel = (plan: Installment, n: number) =>
	`[Ins ${n}/${plan.rows.at(-1)!.n}] ${plan.title}`;

function ownerSection(list: ForecastSection[], id: string | null | undefined): SectionRef | null {
	const s = id ? list.find((x) => x.id === id) : undefined;
	return s ? { key: `owner:${s.id}`, name: s.name, kind: 'owner' } : null;
}

/** A derived default, matched to an owner Section of the same name when there is one. */
function derivedSection(list: ForecastSection[], name: string): SectionRef {
	const s = list.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
	return s
		? { key: `owner:${s.id}`, name: s.name, kind: 'owner' }
		: { key: `derived:${name}`, name, kind: 'derived' };
}

function outflowFromOccurrence(ctx: Ctx, plan: Scheduled, occ: Occurrence): ForecastOutflow {
	const { chart } = ctx.input;
	const link = scheduledLink(plan.id, occ.due);
	const lines = occ.version.lines;
	const toPayee = lines.filter((l) => l.side === 'to' && !l.fee);
	const liability = toPayee.find((l) => chart.account(l.accountId)?.type === 'liability');
	const transferTo =
		!liability && toPayee.length > 0 && toPayee.every((l) => isAsset(chart, l.accountId))
			? toPayee[0].accountId
			: undefined;
	const kind = liability ? 'liability' : transferTo ? 'transfer' : 'expense';

	const feeSum = (mode: 'additional' | 'less') =>
		lines.reduce((s, l, k) => s + (l.fee === mode ? (occ.amounts[k] ?? 0) : 0), 0);
	const additional = feeSum('additional');
	const less = feeSum('less');
	const charges = liability ? chargesFor(ctx, liability.accountId, occ.date) : undefined;
	const change = plan.occurrences[occ.due];
	let total = occ.total ?? 0;
	// A Liability payment expects what was charged, unless an amount was set for this Occurrence.
	if (charges && charges.length && !change?.amounts)
		total = charges.reduce((s, c) => s + c.amount, 0) + additional;
	const varies = occ.total === null && !(charges && charges.length);

	const status = occurrenceStatus(chart, occ, { today: ctx.input.today });
	const from = lines.flatMap((l, k) => (l.side === 'from' ? [{ l, amount: occ.amounts[k] }] : []));
	const defaults: PayingSource[] =
		from.length === 1
			? total > 0
				? [{ accountId: from[0].l.accountId, amount: total }]
				: []
			: from.flatMap(({ l, amount }) => (amount ? [{ accountId: l.accountId, amount }] : []));
	const { sources, usualAccounts } = resolveSources(
		change?.sources,
		defaults,
		ctx.funding,
		status.payments
	);

	const lists = sectionLists(ctx.input);
	const section =
		ownerSection(lists.outflowSections, plan.section) ??
		(liability
			? {
					key: `liability:${liability.accountId}`,
					name: chart.account(liability.accountId)?.name ?? liability.accountId,
					kind: 'liability' as const
				}
			: derivedSection(lists.outflowSections, transferTo ? 'Internal Transfers' : 'Others'));

	return finishOutflow(ctx, {
		key: keyOf(link),
		link,
		label: occ.version.description,
		due: occ.due,
		date: occ.date,
		amount: total - additional,
		additional,
		less,
		total,
		varies,
		kind,
		transferTo,
		liabilityId: liability?.accountId,
		charges,
		section,
		sources,
		usualAccounts,
		status: status.status,
		overdue: status.overdue,
		paid: status.paid,
		ealloc: plan.allocates ?? undefined,
		plan
	});
}

function outflowsFromRows(ctx: Ctx, range: DateRange): ForecastOutflow[] {
	const { chart, today } = ctx.input;
	const lists = sectionLists(ctx.input);
	return ctx.input.installments.flatMap((plan) => {
		if (!isAsset(chart, plan.accounts.paying)) return [];
		const internal = plan.kind === 'internal';
		return rowStatuses(chart, plan, { today })
			.filter((s) => s.state !== 'before' && inRange(s.row.date, range))
			.map((s) => {
				const link: PaidLink = { plan: 'installment', planId: plan.id, due: s.row.due };
				const additional = s.row.additionals.reduce((t, a) => t + a.amount, 0);
				const { sources, usualAccounts } = resolveSources(
					s.row.sources,
					[{ accountId: plan.accounts.paying, amount: s.total }],
					ctx.funding,
					s.payments
				);
				return finishOutflow(ctx, {
					key: keyOf(link),
					link,
					label: rowLabel(plan, s.row.n),
					due: s.row.due,
					date: s.row.date,
					amount: s.total - additional,
					additional,
					less: 0,
					total: s.total,
					varies: false,
					kind: internal ? 'transfer' : 'expense',
					transferTo: internal ? plan.accounts.repaid : undefined,
					section:
						ownerSection(lists.outflowSections, plan.section) ??
						derivedSection(lists.outflowSections, internal ? 'Internal Transfers' : 'Others'),
					sources,
					usualAccounts,
					status: s.state === 'before' ? 'paid' : s.state,
					overdue: s.overdue,
					paid: s.paid,
					plan
				});
			});
	});
}

type Partial_ = Omit<
	ForecastOutflow,
	'unfunded' | 'remaining' | 'allocatedIn' | 'allocatedPaid' | 'carried'
>;

function finishOutflow(ctx: Ctx, o: Partial_): ForecastOutflow {
	const covered = o.sources.reduce((s, x) => s + (x.valid ? x.amount : 0), 0);
	const done = o.status === 'paid' || o.status === 'skipped';
	const allocator = ctx.input.scheduled.find((p) => p.allocates && keyOf(p.allocates) === o.key);
	// The Cut-off that funds the allocating transfer's (first) Occurrence.
	const transfer = allocator
		? occurrencesOf(allocator, { from: '1900-01-01', to: addDays(o.due, 366) })[0]
		: undefined;
	const allocatedIn = transfer ? fundingCutoffOf(transfer.date) : undefined;
	const allocatedPaid = transfer
		? paymentsFor(ctx.input.chart, scheduledLink(transfer.planId, transfer.due)).reduce(
				(s, tx) => s + txTotal(tx),
				0
			)
		: undefined;
	return {
		...o,
		unfunded: done ? 0 : Math.max(0, o.total - covered),
		remaining: done ? 0 : Math.max(0, o.total - o.paid),
		allocatedIn,
		allocatedPaid
	};
}

/** Outflows (Occurrences and Rows) whose current date falls in the range, for this Forecast. */
function outflowsIn(ctx: Ctx, range: DateRange): ForecastOutflow[] {
	const fromPlans = occurrencesIn(ctx.input.scheduled, range)
		.filter(
			({ occ }) => !occ.skipped && classify(ctx.input.chart, occ, ctx.funding).kind === 'outflow'
		)
		.map(({ plan, occ }) => outflowFromOccurrence(ctx, plan, occ));
	return [...fromPlans, ...outflowsFromRows(ctx, range)];
}

function inflowsIn(ctx: Ctx, range: DateRange): ForecastInflow[] {
	const { chart, today } = ctx.input;
	const lists = sectionLists(ctx.input);
	// An Inflow counts by its expected (rule) date; look a little wider for moved ones.
	return occurrencesIn(ctx.input.scheduled, {
		from: addDays(range.from, -62),
		to: addDays(range.to, 62)
	})
		.filter(
			({ occ }) =>
				!occ.skipped &&
				inRange(occ.due, range) &&
				classify(chart, occ, ctx.funding).kind === 'inflow'
		)
		.map(({ plan, occ }) => {
			const link = scheduledLink(plan.id, occ.due);
			const lines = occ.version.lines;
			const to = lines.find((l) => l.side === 'to' && !l.fee && isAsset(chart, l.accountId))!;
			const from = lines.find((l) => l.side === 'from')!;
			const additional = lines.reduce(
				(s, l, k) => s + (l.fee === 'additional' ? (occ.amounts[k] ?? 0) : 0),
				0
			);
			const total = occ.total ?? 0;
			const status = occurrenceStatus(chart, occ, { today });
			const fromType = chart.account(from.accountId)?.type;
			const derived =
				fromType === 'income'
					? 'Pay'
					: fromType === 'liability'
						? 'Loans'
						: fromType === 'asset'
							? 'Repayments'
							: 'Others';
			return {
				key: keyOf(link),
				link,
				label: occ.version.description,
				accountId: to.accountId,
				due: occ.due,
				date: occ.date,
				amount: total - additional,
				additional,
				total,
				varies: occ.total === null,
				received: status.paid,
				receivedOn: status.payments.at(-1)?.date ?? undefined,
				status: status.status,
				late: false,
				section:
					ownerSection(lists.inflowSections, plan.section) ??
					derivedSection(lists.inflowSections, derived),
				plan
			};
		});
}

// ---------------------------------------------------------------------------------------------
// The Forecast

export type Unplanned = {
	txId: string;
	accountId: string;
	date: IsoDate;
	label: string;
	amount: number;
};

export type Lane = {
	accountId: string;
	/** A Funding Account; otherwise an Asset that only receives an Inflow here (shown greyed). */
	funding: boolean;
	balanceToday: number;
	inflows: ForecastInflow[];
	/** Transfers from the owner's other Accounts that are Outflows in this Forecast. */
	transferIn: number;
	/** Money Early-allocated into this reserve for Outflows in this Cut-off. */
	allocatedFor: number;
	/** Inflows + Transfer in + allocated. */
	inn: number;
	forecastedExp: number;
	plannedLeft: number;
	received: number;
	paid: number;
	left: number;
	forecastedEAlloc: number;
	eAlloc: number;
	unplanned: Unplanned[];
};

export type ForecastView = {
	cutoff: IsoDate;
	/** The days whose Inflows this Forecast counts. */
	inflowWindow: DateRange;
	/** The days whose Outflows this Forecast's pay funds. */
	fundedWindow: DateRange;
	fundingAccounts: string[];
	/** False when the Funding Accounts are inherited (no document for this Cut-off yet). */
	storedFunding: boolean;
	inflows: ForecastInflow[];
	outflows: ForecastOutflow[];
	sections: { section: SectionRef; outflows: ForecastOutflow[] }[];
	lanes: Lane[];
	totals: { outflows: number; paid: number; unfunded: number; short: number };
};

const isOpen = (o: { status: PaidStatus['status'] }) =>
	o.status === 'unpaid' || o.status === 'partly-paid';

export function buildForecast(input: ForecastInput, cutoff: IsoDate): ForecastView {
	const { today } = input;
	const { ids: fundingAccounts, stored } = fundingAccountsFor(input, cutoff);
	const funding = new Set(fundingAccounts);
	const current = fundingCutoffOf(today);
	const ctx: Ctx = { input, cutoff, funding, current };
	const inflowWindow = cutoffWindow(cutoff);
	const funded = fundedWindow(cutoff);

	// Inflows: this window's, plus (in today's Forecast) earlier ones never received.
	const inflows = inflowsIn(ctx, inflowWindow);
	if (cutoff === current) {
		const earlier = { from: addDays(inflowWindow.from, -366), to: addDays(inflowWindow.from, -1) };
		for (const i of inflowsIn(ctx, earlier))
			if (isOpen(i) && cutoffOf(i.due) < cutoff) inflows.push({ ...i, late: true });
	}
	inflows.sort((a, b) => a.due.localeCompare(b.due) || a.label.localeCompare(b.label));

	// Outflows: this funded window's; unpaid ones carry to today's Forecast once it has ended.
	const outflows = outflowsIn(ctx, funded).map((o) =>
		cutoff < current && isOpen(o) ? carriedOut(o, current) : o
	);
	if (cutoff === current) {
		const earlier = { from: addDays(funded.from, -366), to: addDays(funded.from, -1) };
		for (const o of outflowsIn(ctx, earlier)) if (isOpen(o)) outflows.push(carriedIn(o));
	}
	outflows.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));

	const lanes = buildLanes(ctx, fundingAccounts, inflows, outflows, funded);
	const sections = groupSections(input, outflows);
	const live = outflows.filter((o) => o.carried === undefined || o.carried === 'in');
	return {
		cutoff,
		inflowWindow,
		fundedWindow: funded,
		fundingAccounts,
		storedFunding: stored,
		inflows,
		outflows,
		sections,
		lanes,
		totals: {
			outflows:
				live.reduce((s, o) => s + o.total, 0) +
				outflows.filter((o) => !live.includes(o)).reduce((s, o) => s + o.paid, 0),
			paid: outflows.reduce((s, o) => s + o.paid, 0),
			unfunded: live.reduce((s, o) => s + o.unfunded, 0),
			short: lanes.filter((l) => l.funding).reduce((s, l) => s + Math.min(0, l.plannedLeft), 0)
		}
	};
}

/** In its own Forecast, a Carried-over Outflow keeps only what was paid. */
function carriedOut(o: ForecastOutflow, to: IsoDate): ForecastOutflow {
	return {
		...o,
		carried: to,
		unfunded: 0,
		sources: o.sources.map((s) => ({ ...s, amount: s.paid }))
	};
}

/** In today's Forecast, it brings only what is left, under Overdue. */
function carriedIn(o: ForecastOutflow): ForecastOutflow {
	// Fully paid sources stay (amount 0) so editing keeps them; screens skip them.
	const sources = o.sources.map((s) => ({
		...s,
		amount: s.amount - s.paid,
		paid: 0,
		priorPaid: s.paid
	}));
	const covered = sources.reduce((s, x) => s + (x.valid ? x.amount : 0), 0);
	return {
		...o,
		carried: 'in',
		section: { key: 'overdue', name: 'Overdue', kind: 'overdue' },
		sources,
		unfunded: Math.max(0, o.remaining - covered)
	};
}

function buildLanes(
	ctx: Ctx,
	fundingAccounts: string[],
	inflows: ForecastInflow[],
	outflows: ForecastOutflow[],
	funded: DateRange
): Lane[] {
	const { chart, today } = ctx.input;
	const ids = [...fundingAccounts];
	for (const i of inflows) if (!ids.includes(i.accountId)) ids.push(i.accountId);

	const unplanned: Unplanned[] = chart
		.transactions()
		.filter(
			(tx) => tx.date !== null && tx.origin === 'normal' && !tx.pays && inRange(tx.date, funded)
		)
		.flatMap((tx) =>
			fundingAccounts
				.map((id) => ({ id, amount: outOf(tx, id) }))
				.filter((x) => x.amount > 0)
				.map((x) => ({
					txId: tx.id,
					accountId: x.id,
					date: tx.date!,
					label: tx.description,
					amount: x.amount
				}))
		);

	return ids.map((accountId) => {
		const mine = inflows.filter((i) => i.accountId === accountId);
		const transfers = outflows.filter(
			(o) => o.kind === 'transfer' && o.transferTo === accountId && !o.ealloc && o.carried !== 'in'
		);
		const allocated = outflows.filter((o) => o.allocatedIn);
		const allocations = allocated.flatMap((o) =>
			o.sources.filter((s) => s.accountId === accountId)
		);
		// Money is in the reserve only once the transfer is recorded.
		const allocatedIn = allocated
			.filter((o) => o.sources.some((s) => s.accountId === accountId))
			.reduce((s, o) => s + Math.min(o.allocatedPaid ?? 0, o.total), 0);
		const draws = outflows.flatMap((o) =>
			o.sources.filter((s) => s.accountId === accountId && s.valid).map((s) => ({ o, s }))
		);
		const spent = unplanned.filter((u) => u.accountId === accountId);
		const transferIn = transfers.reduce((s, o) => s + o.total, 0);
		const allocatedFor = allocations.reduce((s, x) => s + x.amount, 0);
		const inn = mine.reduce((s, i) => s + i.total, 0) + transferIn + allocatedFor;
		const forecastedExp = draws.reduce((s, x) => s + x.s.amount, 0);
		const received =
			mine.reduce((s, i) => s + i.received, 0) +
			transfers.reduce((s, o) => s + Math.min(o.paid, o.total), 0) +
			allocatedIn;
		const paid = draws.reduce((s, x) => s + x.s.paid, 0) + spent.reduce((s, u) => s + u.amount, 0);
		const ea = draws.filter((x) => x.o.ealloc);
		return {
			accountId,
			funding: fundingAccounts.includes(accountId),
			balanceToday: chart.balance(accountId, today),
			inflows: mine,
			transferIn,
			allocatedFor,
			inn,
			forecastedExp,
			plannedLeft: inn - forecastedExp,
			received,
			paid,
			left: received - paid,
			forecastedEAlloc: ea.reduce((s, x) => s + x.s.amount, 0),
			eAlloc: ea.reduce((s, x) => s + x.s.paid, 0),
			unplanned: spent
		};
	});
}

/** Overdue first, then the owner's Sections in order, Liability Sections by name, Others last. */
function groupSections(input: ForecastInput, outflows: ForecastOutflow[]) {
	const list = sectionLists(input).outflowSections;
	const rank = (s: SectionRef): [number, string] => {
		if (s.kind === 'overdue') return [0, ''];
		const others = s.name.trim().toLowerCase() === 'others';
		if (others) return [4, ''];
		if (s.kind === 'owner')
			return [1, String(list.findIndex((x) => `owner:${x.id}` === s.key)).padStart(3, '0')];
		if (s.kind === 'liability') return [2, s.name.toLowerCase()];
		return [3, s.name.toLowerCase()];
	};
	const groups = new Map<string, { section: SectionRef; outflows: ForecastOutflow[] }>();
	for (const o of outflows) {
		const g = groups.get(o.section.key) ?? { section: o.section, outflows: [] };
		g.outflows.push(o);
		groups.set(o.section.key, g);
	}
	return [...groups.values()].sort((a, b) => {
		const [ra, sa] = rank(a.section);
		const [rb, sb] = rank(b.section);
		return ra - rb || sa.localeCompare(sb);
	});
}

// ---------------------------------------------------------------------------------------------
// Writes and guards

/**
 * Saves a Cut-off's Funding Accounts. Only Asset Leaf Accounts, and an Account still used as a
 * valid Paying source in this Forecast can't be removed.
 */
export function planSetFundingAccounts(
	input: ForecastInput,
	cutoff: IsoDate,
	ids: string[],
	now: Date
): ChartWrite[] {
	const { chart } = input;
	const bad = ids.find((id) => !isAssetLeaf(chart, id));
	if (bad) throw new Error(`${chart.account(bad)?.name ?? bad} isn't an Asset Leaf Account.`);
	const view = buildForecast(input, cutoff);
	const keep = new Set(ids);
	const used = view.outflows.find((o) =>
		o.sources.some((s) => s.valid && s.amount > s.paid && !keep.has(s.accountId))
	);
	if (used)
		throw new Error(`"${used.label}" still uses it as a Paying source. Move that source first.`);
	const existing = input.forecasts.find((f) => f.id === cutoff);
	return [
		{
			op: 'setForecast',
			id: cutoff,
			data: { fundingAccounts: [...keep], createdAt: existing?.createdAt ?? now, updatedAt: now }
		}
	];
}

const cutoffName = (c: IsoDate) =>
	new Date(`${c}T00:00:00Z`).toLocaleDateString('en-PH', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

/**
 * Forecast documents and Paying sources that name Accounts, in the shape the Account delete
 * check takes, so an Account a Forecast uses can't be deleted.
 */
export function forecastAccountUsers(
	input: Pick<ForecastInput, 'forecasts' | 'scheduled' | 'installments'>
): AccountUser[] {
	const toMap = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [String(i), id]));
	return [
		...input.forecasts.map((f) => ({
			what: 'The Forecast for',
			title: cutoffName(f.id),
			accounts: toMap(f.fundingAccounts)
		})),
		...input.scheduled.flatMap((p) => {
			const ids = Object.values(p.occurrences).flatMap(
				(c) => c.sources?.map((s) => s.accountId) ?? []
			);
			return ids.length
				? [
						{
							what: 'The Scheduled Transaction',
							title: p.versions.at(-1)!.description,
							accounts: toMap(ids)
						}
					]
				: [];
		}),
		...input.installments.flatMap((p) => {
			const ids = p.rows.flatMap((r) => r.sources?.map((s) => s.accountId) ?? []);
			return ids.length
				? [{ what: 'The Installment Plan', title: p.title, accounts: toMap(ids) }]
				: [];
		})
	];
}

/** Accounts that can be picked as Funding Accounts: unarchived Asset Leaves. */
export const fundingCandidates = (chart: Chart): Account[] =>
	chart.all().filter((a) => !a.archived && isAssetLeaf(chart, a.id));
