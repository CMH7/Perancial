import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { isOwner } from '#lib/owner.ts';
import type { LayoutLoad } from './$types';

// Client-only SPA: nothing renders on a server. adapter-static serves every route from 200.html.
export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
	const { auth } = await import('#lib/firebase/app.ts');
	await auth.authStateReady();
	const user = auth.currentUser;
	const owner = isOwner(user?.uid);
	const onLogin = url.pathname === '/login';

	// PROTOTYPE: let /prototype/* render signed out in dev (stub data). Drop before merging anything.
	const prototype = import.meta.env.DEV && url.pathname.startsWith('/prototype');
	if (prototype && !owner) return { user: null, owner };

	// Every route except /login needs the owner. /login itself handles non-owner sign-ins.
	if (!owner && !onLogin) redirect(307, resolve('/login'));
	if (owner && onLogin) redirect(307, resolve('/'));

	return { user: user ? { uid: user.uid, email: user.email } : null, owner };
};
