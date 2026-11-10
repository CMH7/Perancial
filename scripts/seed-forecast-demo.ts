// Seeds the local emulator with made-up Accounts, plans and Transactions for trying the Forecast
// page. Emulator only (project demo-perancial); the figures are invented. Run after
// `bun run emulators` and `bun run seed:emulators`:  bun scripts/seed-forecast-demo.ts
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import type { ChartWrite, PlanLine, RepeatRule } from '../src/lib/domain/index.ts';
import { commitLedger } from '../src/lib/firebase/ledger.ts';

const app = initializeApp({ apiKey: 'demo', projectId: 'demo-perancial', appId: 'demo' });
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

// The owner test user from scripts/seed-emulator.ts.
const { user } = await signInWithEmailAndPassword(auth, 'owner@perancial.test', 'perancial-dev');
const now = new Date();
const writes: ChartWrite[] = [];

const accounts: [string, string, 'asset' | 'liability' | 'income' | 'expense'][] = [
	['demo-payroll', 'Payroll bank', 'asset'],
	['demo-everyday', 'Everyday bank', 'asset'],
	['demo-reserve', 'Reserve', 'asset'],
	['demo-savings', 'Savings', 'asset'],
	['demo-ewallet', 'E-wallet', 'asset'],
	['demo-friend', 'Owed by a friend', 'asset'],
	['demo-card', 'Card X', 'liability'],
	['demo-loan', 'Gadget loan', 'liability'],
	['demo-salary', 'Salary', 'income'],
	['demo-food', 'Food', 'expense'],
	['demo-internet', 'Internet', 'expense'],
	['demo-insurance', 'Insurance', 'expense'],
	['demo-finance', 'Finance charges', 'expense']
];
accounts.forEach(([id, name, type], order) =>
	writes.push({
		op: 'setAccount',
		id,
		data: {
			name,
			description: '',
			type,
			parentId: type,
			system: null,
			archived: false,
			order: 100 + order,
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
			createdAt: now,
			updatedAt: now
		}
	});
tx('opening_demo-everyday', null, 'Opening Balance', [
	['demo-everyday', 500_000],
	['opening-balances', -500_000]
]);
tx('demo-buffet', '2026-11-09', 'Buffet', [
	['demo-food', 159_800],
	['demo-card', -159_800]
]);

const line = (accountId: string, side: 'from' | 'to', amount: number | null): PlanLine => ({
	accountId,
	side,
	amount
});
function plan(
	id: string,
	description: string,
	rule: RepeatRule,
	lines: PlanLine[],
	extra: Record<string, unknown> = {}
) {
	writes.push({
		op: 'setScheduled',
		id,
		data: {
			versions: [
				{
					from: rule.type === 'once' ? rule.date : rule.start,
					description,
					note: '',
					tags: [],
					lines,
					rule
				}
			],
			end: { type: 'never' },
			occurrences: {},
			createdAt: now,
			updatedAt: now,
			...extra
		}
	});
}
plan(
	'demo-pay',
	'Pay',
	{ type: 'cutoff', start: '2026-11-15' },
	[line('demo-salary', 'from', null), line('demo-payroll', 'to', null)],
	{
		occurrences: {
			'2026-11-15': { amounts: [2_000_000, 2_000_000] },
			'2026-11-30': { amounts: [2_400_000, 2_400_000] }
		}
	}
);
plan('demo-move', 'Move pay to Everyday', { type: 'monthly', day: 16, start: '2026-11-16' }, [
	line('demo-payroll', 'from', 1_500_000),
	line('demo-everyday', 'to', 1_500_000)
]);
plan('demo-internet', 'Internet', { type: 'monthly', day: 20, start: '2026-11-20' }, [
	line('demo-everyday', 'from', 150_000),
	line('demo-internet', 'to', 150_000)
]);
plan(
	'demo-cardpay',
	'Card X payment',
	{ type: 'monthly', day: 25, start: '2026-11-25' },
	[line('demo-everyday', 'from', null), line('demo-card', 'to', null)],
	{
		occurrences: {
			'2026-11-25': {
				sources: [
					{ accountId: 'demo-everyday', amount: 100_000 },
					{ accountId: 'demo-ewallet', amount: 74_800 }
				]
			}
		}
	}
);
plan('demo-music', 'Music', { type: 'monthly', day: 12, start: '2026-10-12' }, [
	line('demo-card', 'from', 15_000),
	line('demo-food', 'to', 15_000)
]);
plan('demo-repay', 'Repayment from a friend', { type: 'once', date: '2026-11-14' }, [
	line('demo-friend', 'from', 120_000),
	line('demo-ewallet', 'to', 120_000)
]);
plan(
	'demo-ins',
	'Insurance',
	{ type: 'monthly', day: 5, start: '2026-12-05' },
	[line('demo-everyday', 'from', 250_000), line('demo-insurance', 'to', 250_000)],
	{
		occurrences: {
			'2026-12-05': { sources: [{ accountId: 'demo-reserve', amount: 250_000 }] }
		}
	}
);
plan(
	'demo-ealloc',
	'Reserve for Insurance',
	{ type: 'once', date: '2026-11-16' },
	[line('demo-everyday', 'from', 250_000), line('demo-reserve', 'to', 250_000)],
	{ allocates: { plan: 'scheduled', planId: 'demo-ins', due: '2026-12-05' } }
);

writes.push({
	op: 'setInstallment',
	id: 'demo-gadget',
	data: {
		kind: 'lender',
		title: 'Gadget loan',
		note: '',
		tags: [],
		purchaseDate: '2026-10-01',
		entry: 'flat',
		rule: { type: 'monthly', day: 28, start: '2026-11-28' },
		trackedFrom: 1,
		accounts: {
			repaid: 'demo-loan',
			paying: 'demo-everyday',
			interest: 'demo-finance',
			fees: 'demo-finance'
		},
		rows: ['2026-11-28', '2026-12-28', '2027-01-28'].map((due, i) => ({
			n: i + 1,
			due,
			date: due,
			principal: 130_000,
			interest: 0,
			additionals: [],
			...(i === 0
				? {
						sources: [
							{ accountId: 'demo-everyday', amount: 80_000 },
							{ accountId: 'demo-savings', amount: 50_000 }
						]
					}
				: {})
		})),
		createdAt: now,
		updatedAt: now
	}
});

writes.push({
	op: 'setForecast',
	id: '2026-11-15',
	data: {
		fundingAccounts: ['demo-payroll', 'demo-everyday', 'demo-reserve', 'demo-savings'],
		createdAt: now,
		updatedAt: now
	}
});

await commitLedger(db, user.uid, writes);
console.log(`wrote ${writes.length} demo documents`);
process.exit(0);
