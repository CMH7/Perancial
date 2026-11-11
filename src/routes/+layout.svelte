<script lang="ts">
	import './layout.css';
	import '#lib/theme.svelte.ts';
	import favicon from '#lib/assets/favicon.svg';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onAuthStateChanged } from 'firebase/auth';
	import { auth } from '#lib/firebase/app.ts';
	import NewTransactionDrawer from '#lib/components/NewTransactionDrawer.svelte';
	import NotificationBell from '#lib/components/NotificationBell.svelte';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import { dialogOpen, isTyping } from '#lib/overlays.svelte.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// The nav bar sticks to the top; pages that fill the window (Forecast) size themselves to
	// the space under it with `var(--nav-h)`.
	let navHeight = $state(0);
	$effect(() => {
		document.documentElement.style.setProperty('--nav-h', `${navHeight}px`);
	});

	// Live Accounts and Transactions while the owner is signed in. Keyed on the UID alone:
	// `data` is a new object on every navigation, which must not restart the listeners.
	const ownerUid = $derived(data.owner ? data.user?.uid : undefined);
	$effect(() => {
		if (ownerUid) return ledger.start(ownerUid);
	});

	// New Transaction drawer: the nav button, or `c` anywhere except while typing, with a modifier
	// (Ctrl+C copies), mid-composition, on key repeat, under a dialog, or on the full form's page.
	let recording = $state(false);
	let drawerBody = $state<HTMLElement>();
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'c' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
		if (e.repeat || e.isComposing || e.defaultPrevented || isTyping(e.target)) return;
		if (!data.owner || dialogOpen() || page.url.pathname === resolve('/transactions/new')) return;
		e.preventDefault();
		recording = true;
		drawerBody?.querySelector<HTMLElement>('input:is([type="text"], :not([type]))')?.focus();
	}

	// The load gate only runs on navigation; this catches sign-out mid-session.
	$effect(() =>
		onAuthStateChanged(auth, (user) => {
			if (!user && page.url.pathname !== '/login') goto(resolve('/login'));
		})
	);
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Perancial</title>
</svelte:head>

{#if data.owner}
	<header
		bind:offsetHeight={navHeight}
		class="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-6 py-3 text-sm"
	>
		<nav class="flex items-center gap-4">
			<a href={resolve('/')} class="text-base"><Wordmark /></a>
			<a href={resolve('/')} class="text-gray-600 hover:text-gray-900">Accounts</a>
			<a href={resolve('/transactions')} class="text-gray-600 hover:text-gray-900">Journal</a>
			<a href={resolve('/scheduled')} class="text-gray-600 hover:text-gray-900">Scheduled</a>
			<a href={resolve('/installments')} class="text-gray-600 hover:text-gray-900">Installments</a>
			<a href={resolve('/forecast')} class="text-gray-600 hover:text-gray-900">Forecast</a>
			<button
				data-overlay-keep
				onclick={() => (recording = !recording)}
				aria-expanded={recording}
				title="New Transaction ( c )"
				class="rounded bg-gray-900 px-2 py-1 text-white hover:bg-gray-700">New Transaction</button
			>
		</nav>
		<div class="flex items-center gap-1">
			<NotificationBell />
			<a
				href={resolve('/settings')}
				class="grid size-8 place-items-center rounded-md hover:bg-gray-100 hover:text-gray-900 {page.url.pathname.startsWith(
					'/settings'
				)
					? 'bg-gray-100 text-gray-900'
					: 'text-gray-500'}"
				aria-label="Settings"
				aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}
				title="Settings"
			>
				<svg
					viewBox="0 0 24 24"
					class="size-5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
					><path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					/><circle cx="12" cy="12" r="3" /></svg
				>
			</a>
		</div>
	</header>
{/if}

{@render children()}

{#if recording && data.owner}
	<div bind:this={drawerBody} class="contents">
		<NewTransactionDrawer onclose={() => (recording = false)} />
	</div>
{/if}
