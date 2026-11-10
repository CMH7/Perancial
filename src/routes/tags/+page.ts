// Tags moved to a Settings tab; old links land there.
import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';

export function load() {
	redirect(307, `${resolve('/settings')}?tab=tags`);
}
