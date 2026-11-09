// Reactive, app-wide view of the owner's Chart of Accounts, fed by Firestore listeners.
import { buildChart, type Account, type Transaction } from '#lib/domain/index.ts';
import { db } from '#lib/firebase/app.ts';
import { ensureSystemAccounts, subscribeLedger } from '#lib/firebase/ledger.ts';

class Ledger {
	accounts = $state.raw<Account[]>([]);
	transactions = $state.raw<Transaction[]>([]);
	/** True once both collections have loaded at least once. */
	ready = $state(false);
	/** Set when seeding fails or a document can't be parsed; data is not trusted then. */
	error = $state<string | null>(null);
	chart = $derived(buildChart(this.accounts, this.transactions));

	#stop: (() => void) | null = null;

	/** Seeds missing System Accounts, then listens. Returns a function that stops listening. */
	start(uid: string): () => void {
		this.stop();
		this.error = null;
		ensureSystemAccounts(db, uid).catch((err: Error) => {
			this.error = `Could not set up your accounts: ${err.message}`;
		});
		this.#stop = subscribeLedger(
			db,
			uid,
			({ accounts, transactions }) => {
				this.accounts = accounts;
				this.transactions = transactions;
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
		this.accounts = [];
		this.transactions = [];
		this.ready = false;
	}
}

export const ledger = new Ledger();
