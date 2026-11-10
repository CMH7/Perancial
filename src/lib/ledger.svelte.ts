// Reactive, app-wide view of the owner's Chart of Accounts, fed by Firestore listeners.
import {
	buildChart,
	type Account,
	type ChartWrite,
	type Installment,
	type Scheduled,
	type Transaction
} from '#lib/domain/index.ts';
import { db } from '#lib/firebase/app.ts';
import {
	commitLedger,
	commitLedgerInBatches,
	ensureSystemAccounts,
	migrateLegacyTransactions,
	newAccountId,
	newInstallmentId,
	newScheduledId,
	newTransactionId,
	subscribeLedger
} from '#lib/firebase/ledger.ts';

class Ledger {
	accounts = $state.raw<Account[]>([]);
	transactions = $state.raw<Transaction[]>([]);
	scheduled = $state.raw<Scheduled[]>([]);
	installments = $state.raw<Installment[]>([]);
	/** True once both collections have loaded at least once. */
	ready = $state(false);
	/** Set when seeding fails or a document can't be parsed; data is not trusted then. */
	error = $state<string | null>(null);
	chart = $derived(buildChart(this.accounts, this.transactions));

	#stop: (() => void) | null = null;
	#uid: string | null = null;

	/** Commits writes atomically for the signed-in owner (validated with Zod first). */
	commit(writes: ChartWrite[]) {
		if (!this.#uid) throw new Error('Not signed in');
		return commitLedger(db, this.#uid, writes);
	}

	/** Commits a change too big for one batch, in batches of at most 500. Not atomic as a whole. */
	commitInBatches(writes: ChartWrite[]) {
		if (!this.#uid) throw new Error('Not signed in');
		return commitLedgerInBatches(db, this.#uid, writes);
	}

	/** A fresh ID for a new Account. */
	newAccountId() {
		if (!this.#uid) throw new Error('Not signed in');
		return newAccountId(db, this.#uid);
	}

	/** A fresh ID for a new Scheduled Transaction. */
	newScheduledId() {
		if (!this.#uid) throw new Error('Not signed in');
		return newScheduledId(db, this.#uid);
	}

	/** A fresh ID for a new Installment Plan. */
	newInstallmentId() {
		if (!this.#uid) throw new Error('Not signed in');
		return newInstallmentId(db, this.#uid);
	}

	/** A fresh ID for a new Transaction. */
	newTransactionId() {
		if (!this.#uid) throw new Error('Not signed in');
		return newTransactionId(db, this.#uid);
	}

	/** Seeds missing System Accounts, upgrades legacy Transactions, then listens. Returns a function that stops listening. */
	start(uid: string): () => void {
		this.stop();
		this.#uid = uid;
		this.error = null;
		Promise.all([ensureSystemAccounts(db, uid), migrateLegacyTransactions(db, uid)]).catch(
			(err: Error) => {
				this.error = `Could not set up your accounts: ${err.message}`;
			}
		);
		this.#stop = subscribeLedger(
			db,
			uid,
			({ accounts, transactions, scheduled, installments }) => {
				this.accounts = accounts;
				this.transactions = transactions;
				this.scheduled = scheduled;
				this.installments = installments;
				this.ready = true;
			},
			(err) => {
				this.error = err.message;
			}
		);
		return () => this.stop();
	}

	stop() {
		this.#stop?.();
		this.#stop = null;
		this.#uid = null;
		this.accounts = [];
		this.transactions = [];
		this.scheduled = [];
		this.installments = [];
		this.ready = false;
	}
}

export const ledger = new Ledger();
