<script lang="ts">
	// Record a new Transaction from anywhere: the nav bar's New Transaction button, or `c`. After a
	// save the form starts over, with a link to the one just saved. Recording a planned occurrence or
	// an Installment row, duplicating, and taking on a plan still go to /transactions/new, which
	// reads those from the URL.
	import { resolve } from '$app/paths';
	import { emptyDraft, today } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import Drawer from './Drawer.svelte';
	import TransactionForm from './TransactionForm.svelte';

	let { onclose }: { onclose: () => void } = $props();

	let round = $state(0);
	let savedId = $state<string | null>(null);
	let body = $state<HTMLElement>();

	// Start typing straight away: focus the first text field (the Description), not the
	// "Copy from" picker or the date above it.
	$effect(() => {
		void round;
		body?.querySelector<HTMLElement>('input:is([type="text"], :not([type]))')?.focus();
	});
</script>

<Drawer id="new-transaction" width={640} label="New Transaction" {onclose}>
	<div bind:this={body}>
		<!-- The form brings its own heading; only the close button is added. -->
		<div class="-mb-2 flex justify-end">
			<button onclick={onclose} class="text-gray-400 hover:text-gray-900" aria-label="Close"
				>✕</button
			>
		</div>
		{#if !ledger.ready}
			<p class="text-sm text-gray-500">Loading your accounts…</p>
		{:else}
			{#if savedId}
				<p class="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
					Saved. <a
						class="underline"
						href={resolve('/transactions/[id]', { id: savedId })}
						onclick={onclose}>Open it</a
					> or record another below.
				</p>
			{/if}
			{#key round}
				<TransactionForm
					initial={emptyDraft({ today: today() })}
					onsaved={(id) => {
						savedId = id;
						round++;
					}}
				/>
			{/key}
		{/if}
	</div>
</Drawer>
