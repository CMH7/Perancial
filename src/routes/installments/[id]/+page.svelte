<script lang="ts">
	// An Installment Plan. Placeholder until the plan page lands ("Installment Plan page", #77).
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ledger } from '#lib/ledger.svelte.ts';

	const plan = $derived(ledger.installments.find((p) => p.id === page.params.id));
</script>

<main class="mx-auto max-w-5xl px-4 py-8">
	<a href={resolve('/installments')} class="text-sm text-gray-500">← Installments</a>
	{#if !ledger.ready}
		<p class="mt-4 text-sm text-gray-500">Loading…</p>
	{:else if !plan}
		<p class="mt-4 text-sm text-gray-500">This plan no longer exists.</p>
	{:else}
		<h1 class="mt-2 text-2xl font-semibold">{plan.title}</h1>
		<p class="mt-2 text-sm text-gray-500">The plan page with its rows is coming next.</p>
	{/if}
</main>
