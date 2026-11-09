// Firestore repository for the Chart of Accounts: paths, System Account seeding, live listeners
// that parse every document with the Zod schemas, and validated batched writes.
// Takes a Firestore instance as a parameter so it runs unchanged against the emulator in tests.
import {
	collection,
	doc,
	onSnapshot,
	runTransaction,
	writeBatch,
	type DocumentData,
	type Firestore
} from 'firebase/firestore';
import {
	ACCOUNT_TYPE_GUIDE,
	AccountDoc,
	TransactionDoc,
	parseAccount,
	parseTransaction,
	type Account,
	type Transaction
} from '#lib/domain/index.ts';

export const accountsPath = (uid: string) => `users/${uid}/accounts`;
export const transactionsPath = (uid: string) => `users/${uid}/transactions`;

/** Firestore Timestamps → Date (duck-typed, so the emulator test SDK's Timestamps work too). */
function fromFirestore(data: DocumentData): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(data))
		out[key] =
			value && typeof (value as { toDate?: unknown }).toDate === 'function'
				? (value as { toDate(): Date }).toDate()
				: value;
	return out;
}

/** The five Root Accounts (with their plain-English guide as Description) and Opening Balances. */
export function systemAccounts(now: Date): Array<[id: string, data: AccountDoc]> {
	const base = { archived: false, createdAt: now, updatedAt: now };
	return [
		...ACCOUNT_TYPE_GUIDE.map((g, i): [string, AccountDoc] => [
			g.type,
			{
				...base,
				name: g.label,
				description: g.what,
				type: g.type,
				parentId: null,
				system: 'root',
				order: i
			}
		]),
		[
			'opening-balances',
			{
				...base,
				name: 'Opening Balances',
				description: 'Balances the starting amounts of your accounts. Managed for you.',
				type: 'equity',
				parentId: 'equity',
				system: 'opening-balances',
				order: 0
			}
		]
	];
}

/** Creates any missing System Accounts. Safe to call on every sign-in; returns how many it created. */
export async function ensureSystemAccounts(db: Firestore, uid: string): Promise<number> {
	const wanted = systemAccounts(new Date());
	return runTransaction(db, async (tx) => {
		const refs = wanted.map(([id]) => doc(db, accountsPath(uid), id));
		const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
		let created = 0;
		snaps.forEach((snap, i) => {
			if (snap.exists()) return;
			tx.set(refs[i], AccountDoc.parse(wanted[i][1]));
			created++;
		});
		return created;
	});
}

export type LedgerSnapshot = { accounts: Account[]; transactions: Transaction[] };

/**
 * Live view of all Accounts and Transactions. Every document is parsed; if any is malformed,
 * `onError` fires and no data is published, so a bad document never yields a wrong Balance.
 * `onData` fires once both collections have loaded, then on every change. Returns unsubscribe.
 */
export function subscribeLedger(
	db: Firestore,
	uid: string,
	onData: (snapshot: LedgerSnapshot) => void,
	onError: (error: Error) => void
): () => void {
	let accounts: Account[] | undefined;
	let transactions: Transaction[] | undefined;
	const publish = () => {
		if (accounts && transactions) onData({ accounts, transactions });
	};
	const parseAll = <T>(
		docs: { id: string; ref: { path: string }; data(): DocumentData }[],
		parse: (id: string, data: unknown) => T
	): T[] | undefined => {
		const out: T[] = [];
		for (const d of docs) {
			try {
				out.push(parse(d.id, fromFirestore(d.data())));
			} catch (err) {
				onError(new Error(`Malformed document ${d.ref.path}: ${(err as Error).message}`));
				return undefined;
			}
		}
		return out;
	};

	const stopAccounts = onSnapshot(
		collection(db, accountsPath(uid)),
		(snap) => {
			accounts = parseAll(snap.docs, parseAccount);
			publish();
		},
		onError
	);
	const stopTransactions = onSnapshot(
		collection(db, transactionsPath(uid)),
		(snap) => {
			transactions = parseAll(snap.docs, parseTransaction);
			publish();
		},
		onError
	);
	return () => {
		stopAccounts();
		stopTransactions();
	};
}

export type LedgerWrite =
	| { op: 'setAccount'; id: string; data: AccountDoc }
	| { op: 'deleteAccount'; id: string }
	| { op: 'setTransaction'; id: string; data: TransactionDoc }
	| { op: 'deleteTransaction'; id: string };

/** A fresh Firestore document ID for a new Account or Transaction. */
export const newAccountId = (db: Firestore, uid: string) =>
	doc(collection(db, accountsPath(uid))).id;
export const newTransactionId = (db: Firestore, uid: string) =>
	doc(collection(db, transactionsPath(uid))).id;

/** Validates every write with the Zod schemas, then commits them atomically in one batch. */
export async function commitLedger(db: Firestore, uid: string, writes: LedgerWrite[]) {
	const batch = writeBatch(db);
	for (const w of writes) {
		switch (w.op) {
			case 'setAccount':
				batch.set(doc(db, accountsPath(uid), w.id), AccountDoc.parse(w.data));
				break;
			case 'deleteAccount':
				batch.delete(doc(db, accountsPath(uid), w.id));
				break;
			case 'setTransaction':
				batch.set(doc(db, transactionsPath(uid), w.id), TransactionDoc.parse(w.data));
				break;
			case 'deleteTransaction':
				batch.delete(doc(db, transactionsPath(uid), w.id));
				break;
		}
	}
	await batch.commit();
}
