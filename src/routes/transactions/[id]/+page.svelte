<script lang="ts">
	// Edit one Transaction. Opening Balances are changed from their Account instead.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import TransactionForm from '#lib/components/TransactionForm.svelte';
	import { draftFromTransaction } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let saved = $state(false);
	const tx = $derived(ledger.chart.transaction(page.params.id ?? ''));
	const openingAccount = $derived(
		tx?.origin === 'opening'
			? tx.entries.find((e) => e.accountId !== 'opening-balances')
			: undefined
	);
</script>

<main class="mx-auto max-w-5xl page-pad">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else if !tx}
		<p class="text-sm text-gray-500">This Transaction no longer exists.</p>
	{:else if openingAccount}
		<p class="text-sm text-gray-600">
			An Opening Balance changes from its Account.
			<a
				class="text-sky-700 underline"
				href={resolve('/accounts/[id]', { id: openingAccount.accountId })}>Go to the Account</a
			>
		</p>
	{:else}
		<a
			href={resolve('/transactions')}
			class="mb-3 inline-block text-sm text-sky-700 hover:underline">← Journal</a
		>
		{#if saved}
			<p class="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Saved.</p>
		{/if}
		{#key tx.id}
			<TransactionForm
				initial={draftFromTransaction(tx)}
				existing={tx}
				onsaved={() => (saved = true)}
				oncancel={() => history.back()}
			/>
		{/key}
	{/if}
</main>
