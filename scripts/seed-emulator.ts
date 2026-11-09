// Creates local test users in the Auth emulator (bun run emulators must be running).
// EMULATOR ONLY: these are throwaway test credentials for project demo-perancial.
//   owner@perancial.test    / perancial-dev   -> UID = OWNER_UID, so local rules behave like production
//   stranger@perancial.test / perancial-dev   -> any other UID, to check "Not authorized"
import { OWNER_UID } from '../src/lib/owner.ts';

const base =
	'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-perancial/accounts';

const users = [
	{ localId: OWNER_UID, email: 'owner@perancial.test', password: 'perancial-dev' },
	{ localId: 'stranger-uid', email: 'stranger@perancial.test', password: 'perancial-dev' }
];

for (const user of users) {
	const res = await fetch(base, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
		body: JSON.stringify(user)
	});
	const body = await res.text();
	if (res.ok) console.log(`created ${user.email} (${user.localId})`);
	else if (/DUPLICATE|EXISTS/.test(body)) console.log(`exists  ${user.email}`);
	else throw new Error(`Failed to create ${user.email}: ${res.status} ${body}`);
}
