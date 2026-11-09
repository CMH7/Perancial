<script lang="ts">
	// Placeholder until the drill-down screen (issue #14): proves live data reaches the app.
	import { formatAmount } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const totals = $derived(ledger.chart.totals());
</script>

<main class="mx-auto max-w-3xl p-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else}
		<p class="text-sm text-gray-500">
			{ledger.accounts.length} accounts · {ledger.transactions.length} transactions
		</p>
		<p class="mt-2 text-2xl font-semibold">Net Worth {formatAmount(totals.netWorth)}</p>
	{/if}
</main>
