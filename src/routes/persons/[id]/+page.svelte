<script lang="ts">
	// One Person's page.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PersonDetail from '#lib/components/PersonDetail.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';
</script>

<main class="page-pad">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading…</p>
	{:else}
		<PersonDetail personId={page.params.id ?? ''} onremoved={() => goto(resolve('/persons'))} />
	{/if}
</main>
