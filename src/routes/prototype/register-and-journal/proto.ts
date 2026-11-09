// PROTOTYPE, throwaway. Stub ledger and helpers for the register / Journal / detail variants (#31).
// Cleared/pending and tags are placeholders: their own tickets decide how they really work.
import { toStorage, type AccountType } from '#lib/domain/index.ts';
import { kindOf, STUB_LEAVES, type Kind, type Leaf } from '../transaction-form/proto.ts';

export { KIND_STYLE } from '../transaction-form/proto.ts';
export type { Kind, Leaf };
export const LEAVES = STUB_LEAVES;

export type Status = 'cleared' | 'pending';
export type Tx = {
	id: string;
	/** null = Opening Balance. */
	date: string | null;
	/** Entry order within a day (stands in for createdAt). */
	seq: number;
	description: string;
	note: string;
	status: Status;
	tags: string[];
	/** Storage sign: source lines negative, destination lines positive. */
	entries: { accountId: string; amount: number }[];
};

/** A Group Account in the stub tree: every path prefix of a Leaf. */
export type Group = { id: string; name: string; path: string; type: AccountType };

export const GROUPS: Group[] = (() => {
	const seen = new Map<string, Group>();
	for (const l of LEAVES) {
		const parts = l.path.split(' › ');
		for (let i = 1; i < parts.length; i++) {
			const path = parts.slice(0, i).join(' › ');
			if (!seen.has(path)) seen.set(path, { id: `g:${path}`, name: parts[i - 1], path, type: l.type });
		}
	}
	return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
})();

const leafOf = (id: string) => LEAVES.find((l) => l.id === id);
export const nameOf = (id: string) =>
	id === 'opening-balances' ? 'Opening Balances' : (leafOf(id)?.name ?? GROUPS.find((g) => g.id === id)?.name ?? id);
export const pathOf = (id: string) => leafOf(id)?.path ?? GROUPS.find((g) => g.id === id)?.path ?? id;
export const typeOf = (id: string): AccountType =>
	leafOf(id)?.type ?? GROUPS.find((g) => g.id === id)!.type;

/** Leaf IDs a register covers: the Leaf itself, or every Leaf under a Group. */
export function leavesUnder(id: string): Set<string> {
	if (leafOf(id)) return new Set([id]);
	const prefix = pathOf(id) + ' › ';
	return new Set(LEAVES.filter((l) => l.path.startsWith(prefix)).map((l) => l.id));
}

let n = 0;
const tx = (
	date: string | null,
	description: string,
	from: [string, number][],
	to: [string, number][],
	extra: Partial<Pick<Tx, 'note' | 'status' | 'tags'>> = {}
): Tx => ({
	id: `t${++n}`,
	date,
	seq: n,
	description,
	note: extra.note ?? '',
	status: extra.status ?? 'cleared',
	tags: extra.tags ?? [],
	entries: [
		...from.map(([accountId, pesos]) => ({ accountId, amount: -Math.round(pesos * 100) })),
		...to.map(([accountId, pesos]) => ({ accountId, amount: Math.round(pesos * 100) }))
	]
});

const OB = 'opening-balances';
export const TXS: Tx[] = [
	tx(null, 'Opening Balance', [[OB, 42_000]], [['bpi', 42_000]]),
	tx(null, 'Opening Balance', [[OB, 1_200]], [['gcash', 1_200]]),
	tx(null, 'Opening Balance', [[OB, 3_000]], [['cash', 3_000]]),
	tx(null, 'Opening Balance', [['cc-bdo', 8_500]], [[OB, 8_500]]),
	tx('2026-10-15', 'Salary, 1st cut-off', [['salary', 23_500]], [['bpi', 23_500]], { tags: ['work'] }),
	tx('2026-10-15', 'Rent October', [['bpi', 12_000]], [['rent', 12_000]], { tags: ['house'] }),
	tx('2026-10-15', 'Send to GCash', [['bpi', 2_015]], [['gcash', 2_000], ['bank-fees', 15]]),
	tx('2026-10-18', 'Groceries at SM', [['cc-bdo', 2_450]], [['food', 2_450]], { tags: ['house'] }),
	tx('2026-10-20', 'Jollibee', [['gcash', 389]], [['dining', 389]]),
	tx('2026-10-22', 'Lent Ana for tuition', [['bpi', 5_000]], [['lent-ana', 5_000]], {
		note: 'She will pay back in two parts,\nNov 15 and Nov 30.'
	}),
	tx('2026-10-25', 'Dinner split with Ana', [['gcash', 1_000], ['cash', 500]], [['dining', 750], ['lent-ana', 750]], {
		note: 'Ana owes her half.'
	}),
	tx('2026-10-28', 'Pay BDO Visa', [['bpi', 8_500]], [['cc-bdo', 8_500]]),
	tx('2026-10-30', 'Salary, 2nd cut-off', [['salary', 23_500]], [['bpi', 23_500]], { tags: ['work'] }),
	tx('2026-10-30', 'Interest', [['interest', 12.34]], [['bpi', 12.34]]),
	tx('2026-11-02', 'Groceries at Puregold', [['cc-bdo', 1_870.5]], [['food', 1_870.5]], { tags: ['house'] }),
	tx('2026-11-05', 'Grab ride home', [['gcash', 245]], [['dining', 245]], { status: 'pending' }),
	tx('2026-11-08', 'Groceries at SM', [['cc-bdo', 2_450]], [['food', 2_450]], { status: 'pending', tags: ['house'] }),
	tx('2026-11-09', 'Ana paid back (part 1)', [['lent-ana', 2_500]], [['gcash', 2_500]], { status: 'pending' }),
	tx('2026-11-09', 'Cash withdrawal', [['bpi', 2_000]], [['cash', 2_000]])
];

export const ALL_TAGS = [...new Set(TXS.flatMap((t) => t.tags))].sort();

export function kindOfTx(t: Tx): Kind | 'Opening Balance' {
	if (t.date === null) return 'Opening Balance';
	const known = (e: { accountId: string }) => leafOf(e.accountId);
	return kindOf(
		t.entries.filter((e) => e.amount < 0 && known(e)).map((e) => typeOf(e.accountId)),
		t.entries.filter((e) => e.amount > 0 && known(e)).map((e) => typeOf(e.accountId))
	);
}

export const sources = (t: Tx) => t.entries.filter((e) => e.amount < 0);
export const destinations = (t: Tx) => t.entries.filter((e) => e.amount > 0);
export const total = (t: Tx) => destinations(t).reduce((s, e) => s + e.amount, 0);
export const summary = (t: Tx) =>
	`${sources(t).map((e) => nameOf(e.accountId)).join(' + ')} → ${destinations(t).map((e) => nameOf(e.accountId)).join(' + ')}`;

/** Oldest first: Opening Balances, then by date, then entry order within the day. */
const chrono = (a: Tx, b: Tx) =>
	(a.date ?? '') < (b.date ?? '') ? -1 : (a.date ?? '') > (b.date ?? '') ? 1 : a.seq - b.seq;

export type RegisterRow = {
	tx: Tx;
	/** This Account's change, display sign (normal direction positive). */
	change: number;
	/** Running Balance after this row, display sign. */
	balance: number;
	/** The other side, as names. */
	counter: string;
};

/** Register rows oldest first, with a running Balance. Group registers roll up every Leaf under. */
export function register(accountId: string): RegisterRow[] {
	const ids = leavesUnder(accountId);
	const type = typeOf(accountId);
	let running = 0;
	return TXS.filter((t) => t.entries.some((e) => ids.has(e.accountId)))
		.sort(chrono)
		.map((t) => {
			const storage = t.entries.filter((e) => ids.has(e.accountId)).reduce((s, e) => s + e.amount, 0);
			const change = toStorage(type, storage);
			running += change;
			const others = t.entries.filter((e) => !ids.has(e.accountId)).map((e) => nameOf(e.accountId));
			return { tx: t, change, balance: running, counter: others.length ? [...new Set(others)].join(', ') : '(within this group)' };
		});
}

export type Filters = {
	q: string;
	from: string;
	to: string;
	accountId: string;
	kind: string;
	status: string;
	tag: string;
};
export const noFilters = (): Filters => ({ q: '', from: '', to: '', accountId: '', kind: '', status: '', tag: '' });

/** Journal: newest first. Search covers Description, Note, tags, and Account names. */
export function journal(f: Filters): Tx[] {
	const q = f.q.trim().toLowerCase();
	const ids = f.accountId ? leavesUnder(f.accountId) : null;
	return TXS.filter((t) => t.date !== null)
		.filter((t) => !f.from || t.date! >= f.from)
		.filter((t) => !f.to || t.date! <= f.to)
		.filter((t) => !ids || t.entries.some((e) => ids.has(e.accountId)))
		.filter((t) => !f.kind || kindOfTx(t) === f.kind)
		.filter((t) => !f.status || t.status === f.status)
		.filter((t) => !f.tag || t.tags.includes(f.tag))
		.filter(
			(t) =>
				!q ||
				[t.description, t.note, ...t.tags, ...t.entries.map((e) => nameOf(e.accountId))]
					.join(' ')
					.toLowerCase()
					.includes(q)
		)
		.sort((a, b) => chrono(b, a));
}

/** Every Account a filter or register can target: Groups and Leaves, by path. */
export const TARGETS = [...GROUPS.map((g) => ({ id: g.id, path: g.path, group: true })), ...LEAVES.map((l) => ({ id: l.id, path: l.path, group: false }))].sort(
	(a, b) => a.path.localeCompare(b.path)
);
