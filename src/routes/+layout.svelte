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

	// Live Accounts and Transactions while the owner is signed in. Keyed on the UID alone:
	// `data` is a new object on every navigation, which must not restart the listeners.
	const ownerUid = $derived(data.owner ? data.user?.uid : undefined);
	$effect(() => {
		if (ownerUid) return ledger.start(ownerUid);
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
		<nav class="flex items-center gap-4">
			<a href={resolve('/')} class="font-semibold">Perancial</a>
			<a href={resolve('/')} class="text-gray-600 hover:text-gray-900">Accounts</a>
			<a href={resolve('/transactions')} class="text-gray-600 hover:text-gray-900">Journal</a>
			<a href={resolve('/scheduled')} class="text-gray-600 hover:text-gray-900">Scheduled</a>
			<a href={resolve('/installments')} class="text-gray-600 hover:text-gray-900">Installments</a>
			<a href={resolve('/forecast')} class="text-gray-600 hover:text-gray-900">Forecast</a>
			<a href={resolve('/settings')} class="text-gray-600 hover:text-gray-900">Settings</a>
			<a
				href={resolve('/transactions/new')}
				class="rounded bg-gray-900 px-2 py-1 text-white hover:bg-gray-700">New Transaction</a
			>
		</nav>
		<div class="flex items-center gap-4 text-gray-500">
			<span>{data.user?.email}</span>
			<button onclick={signOut} class="rounded px-2 py-1 hover:bg-gray-100 hover:text-gray-900"
				>Sign out</button
			>
		</div>
	</header>
{/if}

{@render children()}
