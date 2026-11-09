<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authErrorMessage, signIn, signOut } from '#lib/firebase/auth.ts';
	import { isOwner } from '#lib/owner.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	/** Who was turned away, kept after they are signed out so the message stays on screen. */
	let denied = $state<{ email: string | null; uid: string } | null>(null);

	// Arrived already signed in as someone else (e.g. a session from before): show who, then sign out.
	$effect(() => {
		if (data.user && !data.owner) {
			denied = { email: data.user.email, uid: data.user.uid };
			signOut();
		}
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		denied = null;
		busy = true;
		try {
			const { user } = await signIn(email, password);
			if (!isOwner(user.uid)) {
				denied = { email: user.email, uid: user.uid };
				await signOut();
				return;
			}
			await goto(resolve('/'));
		} catch (err) {
			error = authErrorMessage(err);
		} finally {
			busy = false;
		}
	}
</script>

<main class="flex min-h-screen items-center justify-center bg-gray-100 p-4">
	<form onsubmit={submit} class="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm">
		<h1 class="text-xl font-semibold">Perancial</h1>

		{#if denied}
			<div class="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
				<p class="font-semibold">Not authorized</p>
				<p class="mt-1">{denied.email ?? 'This account'} can't use this app.</p>
				<p class="mt-1 text-xs break-all text-amber-700">UID: {denied.uid}</p>
			</div>
		{/if}

		<label class="block text-sm">
			<span class="text-gray-600">Email</span>
			<input
				type="email"
				bind:value={email}
				autocomplete="username"
				required
				class="mt-1 w-full rounded border-gray-300 text-sm"
			/>
		</label>
		<label class="block text-sm">
			<span class="text-gray-600">Password</span>
			<input
				type="password"
				bind:value={password}
				autocomplete="current-password"
				required
				class="mt-1 w-full rounded border-gray-300 text-sm"
			/>
		</label>

		{#if error}<p class="text-sm text-red-600">{error}</p>{/if}

		<button
			disabled={busy}
			class="w-full rounded bg-gray-900 py-2 text-sm text-white disabled:opacity-50"
			>{busy ? 'Signing in…' : 'Sign in'}</button
		>
	</form>
</main>
