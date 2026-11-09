<script lang="ts">
	// Record a new Transaction. `?copy=<id>` starts from a duplicate of that Transaction.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import TransactionForm from '#lib/components/TransactionForm.svelte';
	import { duplicateDraft, emptyDraft, today } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	/** Bumped after each save so the form starts over. */
	let round = $state(0);
	let savedId = $state<string | null>(null);

	const source = $derived(
		ledger.transactions.find((t) => t.id === page.url.searchParams.get('copy'))
	);
	const initial = $derived(
		source && round === 0
			? duplicateDraft(source, { today: today() })
			: emptyDraft({ today: today() })
	);
</script>

<main class="mx-auto max-w-4xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else}
		{#if savedId}
			<p class="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
				Saved. <a class="underline" href={resolve('/transactions/[id]', { id: savedId })}>Open it</a
				> or record another below.
			</p>
		{/if}
		{#key round}
			<TransactionForm
				{initial}
				onsaved={(id) => {
					savedId = id;
					round++;
				}}
			/>
		{/key}
	{/if}
</main>
