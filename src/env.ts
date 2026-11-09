import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

// Firebase web config is not secret (protected by Firestore rules), but it is still kept in .env.
// Public + static: inlined into the client bundle at build time (no server in this app).
const pub = { public: true, static: true } as const;

export const variables = defineEnvVars({
	FIREBASE_API_KEY: pub,
	FIREBASE_AUTH_DOMAIN: pub,
	FIREBASE_PROJECT_ID: pub,
	FIREBASE_APP_ID: pub,
	FIREBASE_USE_EMULATORS: {
		...pub,
		description:
			'Set to "true" (e.g. in .env.local) to use the local Auth and Firestore emulators.',
		schema: z
			.enum(['true', 'false'])
			.optional()
			.transform((v) => v === 'true')
	}
});
