import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { describe, it } from 'vitest';
import {
	forecastsPath,
	installmentsPath,
	scheduledPath,
	settingsPath,
	transactionsPath
} from '../../src/lib/firebase/ledger.ts';
import { OWNER_UID, ownerDb, useEmulator } from '../emulator.ts';

const env = useEmulator();
const now = new Date();
const stranger = () =>
	env().authenticatedContext('stranger-uid').firestore() as unknown as Firestore;

const forecast = { fundingAccounts: ['everyday', 'savings'], createdAt: now, updatedAt: now };
const fRef = (db: Firestore, id: string) => doc(db, forecastsPath(OWNER_UID), id);

const settings = {
	inflowSections: [{ id: 'pay', name: 'Pay' }],
	outflowSections: [{ id: 'important', name: 'Important' }],
	updatedAt: now
};
const sRef = (db: Firestore, id: string) => doc(db, settingsPath(OWNER_UID), id);

describe('Forecasts', () => {
	it('let the owner write and read a Cut-off', async () => {
		const db = ownerDb(env());
		await assertSucceeds(setDoc(fRef(db, '2026-11-15'), forecast));
		await assertSucceeds(getDoc(fRef(db, '2026-11-15')));
	});

	it('keep everyone else out', async () => {
		await assertFails(setDoc(fRef(stranger(), '2026-11-15'), forecast));
		await assertFails(getDoc(fRef(stranger(), '2026-11-15')));
	});

	it('reject a non-date id, extra or missing keys and wrong types', async () => {
		const db = ownerDb(env());
		await assertFails(setDoc(fRef(db, 'nov-15'), forecast));
		await assertFails(setDoc(fRef(db, '2026-11-15'), { ...forecast, unfunded: 0 }));
		const { fundingAccounts: _f, ...none } = forecast;
		await assertFails(setDoc(fRef(db, '2026-11-15'), none));
		await assertFails(setDoc(fRef(db, '2026-11-15'), { ...forecast, fundingAccounts: 'everyday' }));
	});
});

describe('Forecast settings', () => {
	it('let the owner write and read the Section lists', async () => {
		const db = ownerDb(env());
		await assertSucceeds(setDoc(sRef(db, 'forecast'), settings));
		await assertSucceeds(getDoc(sRef(db, 'forecast')));
	});

	it('keep everyone else out', async () => {
		await assertFails(setDoc(sRef(stranger(), 'forecast'), settings));
		await assertFails(getDoc(sRef(stranger(), 'forecast')));
	});

	it('reject other settings documents, extra keys and wrong types', async () => {
		const db = ownerDb(env());
		await assertFails(setDoc(sRef(db, 'theme'), settings));
		await assertFails(setDoc(sRef(db, 'forecast'), { ...settings, colour: 'blue' }));
		await assertFails(setDoc(sRef(db, 'forecast'), { ...settings, outflowSections: 'Others' }));
	});
});

describe('Forecast fields on plans and Transactions', () => {
	const rule = { type: 'once', date: '2026-11-16' };
	const transfer = {
		versions: [
			{
				from: '2026-11-16',
				description: 'Reserve for insurance',
				note: '',
				tags: [],
				lines: [
					{ accountId: 'everyday', side: 'from', amount: 250000 },
					{ accountId: 'reserve', side: 'to', amount: 250000 }
				],
				rule
			}
		],
		end: { type: 'never' },
		occurrences: { '2026-11-16': { sources: [{ accountId: 'everyday', amount: 250000 }] } },
		createdAt: now,
		updatedAt: now
	};

	it('accept a Section and an Early allocation link on a Scheduled plan', async () => {
		const db = ownerDb(env());
		const ref = doc(db, scheduledPath(OWNER_UID), 'p1');
		const allocates = { plan: 'scheduled', planId: 'ins', due: '2026-12-05' };
		await assertSucceeds(setDoc(ref, { ...transfer, section: 'important', allocates }));
		await assertSucceeds(setDoc(ref, { ...transfer, section: null, allocates: null }));
		await assertFails(setDoc(ref, { ...transfer, section: '' }));
		await assertFails(setDoc(ref, { ...transfer, allocates: 'ins' }));
	});

	it('accept a Section on an Installment Plan', async () => {
		const db = ownerDb(env());
		const ref = doc(db, installmentsPath(OWNER_UID), 'p1');
		const plan = {
			kind: 'lender',
			title: 'Gadget loan',
			note: '',
			tags: [],
			purchaseDate: '2026-10-01',
			entry: 'flat',
			rule: { type: 'monthly', day: 28, start: '2026-11-28' },
			trackedFrom: 1,
			accounts: { repaid: 'loan', paying: 'everyday', interest: 'finance', fees: 'finance' },
			rows: [
				{
					n: 1,
					due: '2026-11-28',
					date: '2026-11-28',
					principal: 130000,
					interest: 0,
					additionals: []
				}
			],
			createdAt: now,
			updatedAt: now
		};
		await assertSucceeds(setDoc(ref, { ...plan, section: 'important' }));
		await assertFails(setDoc(ref, { ...plan, section: 5 }));
	});

	it('accept billOn on a Transaction', async () => {
		const db = ownerDb(env());
		const ref = doc(db, transactionsPath(OWNER_UID), 't1');
		const buffet = {
			date: '2026-11-09',
			origin: 'normal',
			description: 'Buffet',
			entries: [
				{ accountId: 'food', amount: 159800 },
				{ accountId: 'card', amount: -159800 }
			],
			accountIds: ['food', 'card'],
			createdAt: now,
			updatedAt: now
		};
		await assertSucceeds(setDoc(ref, { ...buffet, billOn: '2026-11-26' }));
		await assertSucceeds(setDoc(ref, { ...buffet, billOn: null }));
		await assertFails(setDoc(ref, { ...buffet, billOn: 20261126 }));
	});
});
