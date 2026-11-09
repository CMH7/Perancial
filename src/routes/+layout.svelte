<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '#lib/firebase/app.ts';
	import { signOut } from '#lib/firebase/auth.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Live Accounts and Transactions while the owner is signed in.
	$effect(() => {
		if (data.owner && data.user) return ledger.start(data.user.uid);
	});

	// The load gate only runs on navigation; this catches sign-out mid-session.
	$effect(() =>
		onAuthStateChanged(auth, (user) => {
			if (!user && page.url.pathname !== '/login') goto(resolve('/login'));
		})
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Perancial</title>
</svelte:head>

{#if data.owner}
	<header class="flex items-center justify-between border-b bg-white px-6 py-3 text-sm">
		<a href={resolve('/')} class="font-semibold">Perancial</a>
		<div class="flex items-center gap-4 text-gray-500">
			<span>{data.user?.email}</span>
			<button onclick={signOut} class="rounded px-2 py-1 hover:bg-gray-100 hover:text-gray-900"
				>Sign out</button
			>
		</div>
	</header>
{/if}

{@render children()}
