import type { Account, AccountType, Transaction } from './schemas.ts';

/** A plain calendar date, `YYYY-MM-DD`. Compares correctly as a string. */
export type IsoDate = string;

export type Chart = {
	/** The Account with this ID, if it has loaded. */
	account(id: string): Account | undefined;
	/**
	 * Balance as of `asOf` (default: today), in display sign: a normal Balance is positive
	 * for every Account Type. Opening Balances count on any date; later Entries don't count yet.
	 */
	balance(id: string, asOf?: IsoDate): number;
	/** Child Accounts in manual `order`; Archived Accounts only with `showArchived`. */
	children(id: string, options?: { showArchived?: boolean }): Account[];
	/** Accounts from the Root Account down to `id`, inclusive. */
	path(id: string): Account[];
	/** Root Accounts are always Group Accounts; any other Account is one when it has children. */
	isGroup(id: string): boolean;
	/** Whether any Transaction (Opening Balance included) has an Entry on this Account itself. */
	hasEntries(id: string): boolean;
	/** Number of Accounts anywhere under `id`. */
	descendantCount(id: string): number;
	/** Total Assets, Total Liabilities (both display sign) and Net Worth = Assets − Liabilities. */
	totals(asOf?: IsoDate): { assets: number; liabilities: number; netWorth: number };
};

/** Storage sign is the debit/credit rule; these types grow with negative amounts. */
const CREDIT_NORMAL: ReadonlySet<AccountType> = new Set(['liability', 'equity', 'income']);

/** Converts a display-sign amount (normal Balance positive) to storage sign for this type. */
export const toStorage = (type: AccountType, display: number) =>
	CREDIT_NORMAL.has(type) ? -display : display;

/** Today in local time as `YYYY-MM-DD`. */
export function today(): IsoDate {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function buildChart(accounts: Account[], transactions: Transaction[]): Chart {
	const byId = new Map(accounts.map((a) => [a.id, a]));
	const childrenOf = new Map<string, Account[]>();
	for (const a of accounts) {
		if (a.parentId === null) continue;
		const list = childrenOf.get(a.parentId) ?? [];
		list.push(a);
		childrenOf.set(a.parentId, list);
	}
	for (const list of childrenOf.values()) list.sort((a, b) => a.order - b.order);
	const kids = (id: string) => childrenOf.get(id) ?? [];

	/** Sum in storage sign: own Entries plus every descendant's, as of a date. */
	function storageSum(id: string, asOf: IsoDate): number {
		let sum = 0;
		for (const tx of transactions) {
			if (tx.date !== null && tx.date > asOf) continue;
			for (const e of tx.entries) if (e.accountId === id) sum += e.amount;
		}
		for (const child of kids(id)) sum += storageSum(child.id, asOf);
		return sum;
	}

	function balance(id: string, asOf: IsoDate = today()): number {
		const sum = storageSum(id, asOf);
		const type = byId.get(id)?.type;
		return type && CREDIT_NORMAL.has(type) ? -sum : sum;
	}

	function descendantCount(id: string): number {
		return kids(id).reduce((n, child) => n + 1 + descendantCount(child.id), 0);
	}

	return {
		account: (id) => byId.get(id),
		hasEntries: (id) => transactions.some((tx) => tx.entries.some((e) => e.accountId === id)),
		balance,
		descendantCount,
		children(id, { showArchived = false } = {}) {
			return kids(id).filter((a) => showArchived || !a.archived);
		},
		path(id) {
			const out: Account[] = [];
			for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined)
				out.unshift(cur);
			return out;
		},
		isGroup(id) {
			return byId.get(id)?.system === 'root' || kids(id).length > 0;
		},
		totals(asOf = today()) {
			const assets = balance('asset', asOf);
			const liabilities = balance('liability', asOf);
			return { assets, liabilities, netWorth: assets - liabilities };
		}
	};
}
