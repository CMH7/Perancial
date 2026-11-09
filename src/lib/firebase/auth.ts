import {
	signInWithEmailAndPassword,
	signOut as firebaseSignOut,
	type AuthError
} from 'firebase/auth';
import { auth } from './app.ts';

/** Signs in with email + password (v1). There is no sign-up: the owner's user is made in the console. */
export async function signIn(email: string, password: string) {
	return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function signOut() {
	// The offline cache is kept on sign-out (personal devices).
	await firebaseSignOut(auth);
}

/** Plain-English message for a Firebase Auth error. */
export function authErrorMessage(error: unknown): string {
	switch ((error as AuthError)?.code) {
		case 'auth/invalid-credential':
		case 'auth/wrong-password':
		case 'auth/user-not-found':
		case 'auth/invalid-email':
			return 'Wrong email or password.';
		case 'auth/too-many-requests':
			return 'Too many attempts. Wait a bit and try again.';
		case 'auth/network-request-failed':
			return 'No connection. Check your internet and try again.';
		default:
			return 'Sign-in failed. Try again.';
	}
}
