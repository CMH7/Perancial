<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authErrorMessage, signIn, signOut } from '#lib/firebase/auth.ts';
	import PesoHero from '#lib/components/PesoHero.svelte';
	import Wordmark from '#lib/components/Wordmark.svelte';
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

<!-- A landing-style hero: the Peso mark huge and lying back in 3D behind everything, glows
     around it, and the sign-in card floating on the right. -->
<main
	class="relative isolate min-h-screen overflow-hidden bg-gray-100"
	style="background-image: var(--grain)"
>
	<PesoHero />

	<div class="relative grid min-h-screen grid-rows-[auto_1fr_auto] gap-8 p-6 sm:p-10 lg:p-14">
		<header class="text-2xl"><Wordmark /></header>

		<div class="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
			<div class="hidden lg:block"></div>
			<div class="flex justify-center lg:justify-end">
				<form
					onsubmit={submit}
					class="w-full max-w-sm space-y-5 rounded-2xl border bg-white/75 p-8 text-sm shadow-2xl backdrop-blur-md"
				>
					<div class="space-y-3">
						<h1 class="text-2xl font-semibold tracking-tight">Sign in</h1>
						<p class="text-gray-500">Welcome back. Your ledger is where you left it.</p>
					</div>

					{#if denied}
						<div class="rounded-lg bg-amber-50 p-3 text-amber-900">
							<p class="font-semibold">Not authorized</p>
							<p class="mt-1">{denied.email ?? 'This account'} can't use this app.</p>
							<p class="mt-1 text-xs break-all text-amber-700">UID: {denied.uid}</p>
						</div>
					{/if}

					<label class="block">
						<span class="mb-1 block text-xs font-semibold text-gray-500 uppercase">Email</span>
						<input
							type="email"
							bind:value={email}
							autocomplete="username"
							required
							class="w-full rounded-md border-gray-300 py-2 text-sm"
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-xs font-semibold text-gray-500 uppercase">Password</span>
						<input
							type="password"
							bind:value={password}
							autocomplete="current-password"
							required
							class="w-full rounded-md border-gray-300 py-2 text-sm"
						/>
					</label>

					{#if error}<p class="text-red-600">{error}</p>{/if}

					<button
						disabled={busy}
						class="w-full rounded-md bg-gray-900 py-2.5 font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
						>{busy ? 'Signing in…' : 'Sign in'}</button
					>
				</form>
			</div>
		</div>

		<footer class="flex flex-wrap items-end justify-between gap-4">
			<div>
				<p class="text-4xl font-semibold tracking-tight sm:text-5xl">Every peso, one line.</p>
				<p class="mt-3 max-w-md text-gray-600">
					Where each peso came from, where it went, and what's coming at the next cut-off.
				</p>
			</div>
			<p class="text-xs text-gray-500">Personal finance, in pesos.</p>
		</footer>
	</div>
</main>
