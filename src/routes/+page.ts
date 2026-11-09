import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

// The Chart of Accounts opens on the Assets tab.
export const load = () => redirect(307, resolve('/accounts/[id]', { id: 'asset' }));
