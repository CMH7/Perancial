// PROTOTYPE, wipe me. Adds made-up nested Group Accounts (Root > Group > Group > Leaf) to the
// local emulator so the Accounts page prototypes can be tried with depth. Emulator only.
//   bun scripts/prototype-seed-nested-accounts.ts
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import type { ChartWrite } from '../src/lib/domain/index.ts';
import { commitLedger } from '../src/lib/firebase/ledger.ts';

const app = initializeApp({ apiKey: 'demo', projectId: 'demo-perancial', appId: 'demo' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

const { user } = await signInWithEmailAndPassword(auth, 'owner@perancial.test', 'perancial-dev');
const now = new Date();
const writes: ChartWrite[] = [];

// [id, name, type, parentId]
const accounts: [string, string, 'asset' | 'expense', string][] = [
	['proto-banks', 'Banks', 'asset', 'asset'],
	['proto-bank-a', 'Bank A', 'asset', 'proto-banks'],
	['proto-bank-a-sav', 'Bank A Savings', 'asset', 'proto-bank-a'],
	['proto-bank-a-chk', 'Bank A Checking', 'asset', 'proto-bank-a'],
	['proto-digital', 'Digital banks', 'asset', 'proto-banks'],
	['proto-digital-1', 'Digital Bank One — high-yield savings goal for emergencies', 'asset', 'proto-digital'],
	['proto-digital-2', 'Digital Bank Two', 'asset', 'proto-digital'],
	['proto-living', 'Living', 'expense', 'expense'],
	['proto-meals', 'Groceries & dining', 'expense', 'proto-living'],
	['proto-groceries', 'Groceries', 'expense', 'proto-meals'],
	['proto-dining', 'Dining out', 'expense', 'proto-meals'],
	['proto-coffee', 'Coffee', 'expense', 'proto-meals'],
	['proto-utilities', 'Utilities', 'expense', 'proto-living'],
	['proto-power', 'Electricity', 'expense', 'proto-utilities'],
	['proto-water', 'Water', 'expense', 'proto-utilities']
];
accounts.forEach(([id, name, type, parentId], order) =>
	writes.push({
		op: 'setAccount',
		id,
		data: {
			name,
			description: '',
			type,
			parentId,
			system: null,
			archived: false,
			order: 500 + order,
			createdAt: now,
			updatedAt: now
		}
	})
);

const tx = (id: string, date: string | null, description: string, entries: [string, number][]) =>
	writes.push({
		op: 'setTransaction',
		id,
		data: {
			date,
			origin: date ? 'normal' : 'opening',
			description,
			note: '',
			status: 'cleared',
			tags: [],
			entries: entries.map(([accountId, amount]) => ({ accountId, amount })),
			accountIds: entries.map(([a]) => a),
			pays: null,
			billOn: null,
			recordedWith: null,
			createdAt: now,
			updatedAt: now
		}
	});
for (const [id, amount] of [
	['proto-bank-a-sav', 4_250_000],
	['proto-bank-a-chk', 820_000],
	['proto-digital-1', 1_500_000],
	['proto-digital-2', 230_000]
] as const)
	tx(`opening_${id}`, null, 'Opening Balance', [
		[id, amount],
		['opening-balances', -amount]
	]);
tx('proto-tx-groceries', '2026-11-08', 'Weekly groceries', [
	['proto-groceries', 245_000],
	['proto-bank-a-chk', -245_000]
]);
tx('proto-tx-dining', '2026-11-09', 'Dinner', [
	['proto-dining', 120_000],
	['proto-bank-a-chk', -120_000]
]);
tx('proto-tx-coffee', '2026-11-10', 'Coffee', [
	['proto-coffee', 18_000],
	['proto-digital-2', -18_000]
]);
tx('proto-tx-power', '2026-11-05', 'Electric bill', [
	['proto-power', 310_000],
	['proto-bank-a-chk', -310_000]
]);

await commitLedger(db, user.uid, writes);
console.log(`wrote ${writes.length} documents`);
process.exit(0);
