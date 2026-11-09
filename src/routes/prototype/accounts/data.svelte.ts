// PROTOTYPE — throwaway. In-memory fake Chart of Accounts for the layout prototype.
// Amounts are integer centavos, already in display sign (normal Balance = positive).
// Nothing here is persisted; reload resets everything.

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';

export type Account = {
	id: string;
	name: string;
	description: string;
	type: AccountType;
	parentId: string | null;
	system: 'root' | 'opening-balances' | null;
	archived: boolean;
	/** Opening Balance (Asset/Liability Leaf Accounts only). */
	opening: number;
	/** Fake sum of Transactions on this Leaf Account. */
	activity: number;
};

export const TYPES: { type: AccountType; label: string }[] = [
	{ type: 'asset', label: 'Assets' },
	{ type: 'liability', label: 'Liabilities' },
	{ type: 'equity', label: 'Equity' },
	{ type: 'income', label: 'Income' },
	{ type: 'expense', label: 'Expenses' }
];

let seq = 100;
const nid = () => `a${seq++}`;

function seed(): Account[] {
	const out: Account[] = [];
	const add = (
		id: string,
		name: string,
		type: AccountType,
		parentId: string | null,
		opening = 0,
		activity = 0,
		description = '',
		extra: Partial<Account> = {}
	) =>
		out.push({ id, name, description, type, parentId, system: null, archived: false, opening, activity, ...extra });

	for (const t of TYPES) add(t.type, t.label, t.type, null, 0, 0, '', { system: 'root' });
	add('opening-balances', 'Opening Balances', 'equity', 'equity', 0, 0, 'Balances the starting amounts of your accounts', { system: 'opening-balances' });

	// Assets
	add('cash', 'Cash on Hand', 'asset', 'asset', 500000, -155000, 'Wallet cash');
	add('maribank', 'MariBank', 'asset', 'asset', 0, 0, 'Digital bank');
	add('mb-savings', 'Savings', 'asset', 'maribank', 4000000, 500000);
	add('mb-goals', 'Goals', 'asset', 'maribank');
	add('mb-emergency', 'Emergency Fund', 'asset', 'mb-goals', 1500000, 500000);
	add('mb-travel', 'Travel', 'asset', 'mb-goals', 0, 850000, 'Japan 2027');
	add('gcash', 'GCash', 'asset', 'asset', 100000, 131075);
	add('bpi', 'BPI Checking', 'asset', 'asset', 200000, -250000, 'Overdrawn on purpose (Abnormal Balance)');
	add('receivables', 'Receivables', 'asset', 'asset', 0, 0, 'Money others owe me');
	add('rcv-hazel', 'Hazel', 'asset', 'receivables', 500000, 0);
	add('unionbank', 'Old UnionBank', 'asset', 'asset', 300000, -300000, 'Closed in 2025', { archived: true });

	// Liabilities
	add('cards', 'Credit Cards', 'liability', 'liability');
	add('card-bpi', 'BPI Card', 'liability', 'cards', 800000, 434000);
	add('card-metro', 'Metrobank Card', 'liability', 'cards', 0, -120000, 'Overpaid (Abnormal Balance)');
	add('ploan', 'MariBank PLoan', 'liability', 'liability', 0, 0, 'Personal loan, split');
	add('ploan-cm', 'CM', 'liability', 'ploan', 3000000, -500000);
	add('ploan-hazel', 'Hazel', 'liability', 'ploan', 3000000, -500000);

	// Income
	add('salary', 'Salary', 'income', 'income', 0, 6000000);
	add('freelance', 'Freelance', 'income', 'income', 0, 1200000);
	add('interest', 'Interest', 'income', 'income', 0, 31240);

	// Expenses
	add('food', 'Food', 'expense', 'expense');
	add('groceries', 'Groceries', 'expense', 'food', 0, 820000);
	add('dining', 'Dining Out', 'expense', 'food', 0, 315000);
	add('utilities', 'Utilities', 'expense', 'expense');
	add('electricity', 'Electricity', 'expense', 'utilities', 0, 289000);
	add('internet', 'Internet', 'expense', 'utilities', 0, 169900);
	add('transport', 'Transport', 'expense', 'expense', 0, 240000);
	return out;
}

export const db = $state({ accounts: seed(), log: 'Loaded fake data' });

export const byId = (id: string) => db.accounts.find((a) => a.id === id)!;
export const allChildren = (id: string) => db.accounts.filter((a) => a.parentId === id);
export const childrenOf = (id: string, showArchived = false) =>
	allChildren(id).filter((a) => showArchived || !a.archived);
export const isGroup = (a: Account) => a.system === 'root' || allChildren(a.id).length > 0;
export const hasEntries = (a: Account) => a.opening !== 0 || a.activity !== 0;
export const takesOpening = (t: AccountType) => t === 'asset' || t === 'liability';

export function balance(id: string): number {
	const acc = byId(id);
	if (acc.system === 'opening-balances') {
		const sum = (t: AccountType) =>
			db.accounts.filter((a) => a.type === t).reduce((s, a) => s + a.opening, 0);
		return sum('asset') - sum('liability');
	}
	if (isGroup(acc)) return allChildren(id).reduce((s, k) => s + balance(k.id), 0);
	return acc.opening + acc.activity;
}

export const totals = () => {
	const assets = balance('asset');
	const liabilities = balance('liability');
	return { assets, liabilities, netWorth: assets - liabilities };
};

export function pathOf(id: string): Account[] {
	const out: Account[] = [];
	let cur: Account | undefined = byId(id);
	while (cur) {
		out.unshift(cur);
		cur = cur.parentId ? byId(cur.parentId) : undefined;
	}
	return out;
}

export function subtreeIds(id: string): string[] {
	return [id, ...allChildren(id).flatMap((k) => subtreeIds(k.id))];
}

export const countDescendants = (id: string) => subtreeIds(id).length - 1;

export function fmt(c: number): string {
	const s = (Math.abs(c) / 100).toLocaleString('en-PH', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
	return `${c < 0 ? '−' : ''}₱${s}`;
}

export const parseAmount = (s: string) =>
	Math.round(parseFloat(String(s).replace(/[,₱\s]/g, '')) * 100) || 0;

// ---- Rules (the decided ones, stubbed in memory) ----

export function deleteBlocker(id: string): string | null {
	const acc = byId(id);
	if (acc.system) return 'System Accounts cannot be deleted.';
	const busy = subtreeIds(id).some((x) => byId(x).activity !== 0);
	return busy ? 'Has Transactions besides Opening Balances. Archive it instead (needs ₱0 Balance).' : null;
}

export function archiveBlocker(id: string): string | null {
	const acc = byId(id);
	if (acc.system) return 'System Accounts cannot be archived.';
	if (balance(id) !== 0) return `Balance is ${fmt(balance(id))}. Move the money out first; only ₱0 Accounts can be archived.`;
	return null;
}

export function moveTargets(id: string): Account[] {
	const acc = byId(id);
	const inside = new Set(subtreeIds(id));
	return db.accounts.filter(
		(t) =>
			t.type === acc.type &&
			!inside.has(t.id) &&
			t.id !== acc.parentId &&
			t.system !== 'opening-balances' &&
			!t.archived &&
			(isGroup(t) || !hasEntries(t))
	);
}

export type NewChild = { name: string; description: string; opening: number };

export function createAccount(input: {
	parentId: string;
	name: string;
	description: string;
	opening: number;
	children: NewChild[];
}) {
	const parent = byId(input.parentId);
	const type = parent.type;
	if (!isGroup(parent) && hasEntries(parent)) {
		// ADR 0002: existing doc becomes the new child; a new Group takes the old name/position.
		const groupId = nid();
		db.accounts.push({
			id: groupId,
			name: parent.name,
			description: parent.description,
			type,
			parentId: parent.parentId,
			system: null,
			archived: false,
			opening: 0,
			activity: 0
		});
		parent.name = input.name;
		parent.description = input.description;
		parent.parentId = groupId;
		db.log = `Converted "${db.accounts.find((a) => a.id === groupId)!.name}" to a Group; its money moved to new child "${input.name}"`;
		return;
	}
	const id = nid();
	const leafOpening = takesOpening(type) && input.children.length === 0 ? input.opening : 0;
	db.accounts.push({
		id,
		name: input.name,
		description: input.description,
		type,
		parentId: parent.id,
		system: null,
		archived: false,
		opening: leafOpening,
		activity: 0
	});
	for (const c of input.children)
		db.accounts.push({
			id: nid(),
			name: c.name,
			description: c.description,
			type,
			parentId: id,
			system: null,
			archived: false,
			opening: takesOpening(type) ? c.opening : 0,
			activity: 0
		});
	db.log = `Created "${input.name}"${input.children.length ? ` with ${input.children.length} child account(s)` : ''}`;
}

export function updateAccount(id: string, patch: { name: string; description: string; opening: number }) {
	const acc = byId(id);
	if (acc.system === 'root') acc.description = patch.description;
	else if (!acc.system) {
		acc.name = patch.name;
		acc.description = patch.description;
		if (!isGroup(acc) && takesOpening(acc.type)) acc.opening = patch.opening;
	}
	db.log = `Edited "${acc.name}"`;
}

export function moveAccount(id: string, destId: string) {
	const acc = byId(id);
	acc.parentId = destId;
	db.log = `Moved "${acc.name}" under "${byId(destId).name}"`;
}

export function doArchive(id: string) {
	const acc = byId(id);
	if (acc.archived) {
		for (const x of subtreeIds(id)) byId(x).archived = false;
		db.log = `Unarchived "${acc.name}"`;
		return;
	}
	const why = archiveBlocker(id);
	if (why) return alert(why);
	const n = countDescendants(id);
	if (!confirm(`Archive "${acc.name}"${n ? ` and ${n} child account(s)` : ''}? You can unarchive later.`)) return;
	for (const x of subtreeIds(id)) byId(x).archived = true;
	db.log = `Archived "${acc.name}"`;
}

export function doDelete(id: string): boolean {
	const acc = byId(id);
	const why = deleteBlocker(id);
	if (why) {
		alert(why);
		return false;
	}
	const n = countDescendants(id);
	if (!confirm(`Delete "${acc.name}"${n ? ` and ${n} child account(s)` : ''}? This cannot be undone.`)) return false;
	const gone = new Set(subtreeIds(id));
	db.accounts = db.accounts.filter((a) => !gone.has(a.id));
	db.log = `Deleted "${acc.name}"`;
	return true;
}
