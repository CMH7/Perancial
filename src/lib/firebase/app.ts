import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
	connectFirestoreEmulator,
	initializeFirestore,
	memoryLocalCache,
	persistentLocalCache,
	persistentMultipleTabManager
} from 'firebase/firestore';
import {
	FIREBASE_API_KEY,
	FIREBASE_APP_ID,
	FIREBASE_AUTH_DOMAIN,
	FIREBASE_PROJECT_ID,
	FIREBASE_USE_EMULATORS
} from '$app/env/public';

/** Project ID used by the local emulators; the `demo-` prefix keeps them away from real resources. */
export const EMULATOR_PROJECT_ID = 'demo-perancial';

export const usingEmulators = FIREBASE_USE_EMULATORS;

export const app = initializeApp({
	apiKey: FIREBASE_API_KEY,
	authDomain: FIREBASE_AUTH_DOMAIN,
	projectId: usingEmulators ? EMULATOR_PROJECT_ID : FIREBASE_PROJECT_ID,
	appId: FIREBASE_APP_ID
});

export const auth = getAuth(app);

// Offline cache in IndexedDB, shared across tabs. The emulator gets a memory cache so the
// local SDK cache can't drift from emulator data that is reset between runs.
export const db = initializeFirestore(app, {
	localCache: usingEmulators
		? memoryLocalCache()
		: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

if (usingEmulators) {
	connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
	connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
