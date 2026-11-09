<script lang="ts">
	// PROTOTYPE — throwaway. Three variants of the Chart of Accounts screens, switchable via ?variant=,
	// on a throwaway route /prototype/accounts. Fake in-memory data; reload resets.
	import { page } from '$app/state';
	import PrototypeSwitcher from '#lib/components/PrototypeSwitcher.svelte';
	import { db } from './data.svelte';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';

	const variants = [
		{ key: 'A', name: 'Tree table' },
		{ key: 'B', name: 'Sidebar + detail' },
		{ key: 'C', name: 'Drill-down' }
	];
	const v = $derived(page.url.searchParams.get('variant') ?? 'A');
</script>

<div class="min-h-screen bg-gray-100 text-gray-900">
	{#if v === 'B'}
		<VariantB />
	{:else if v === 'C'}
		<VariantC />
	{:else}
		<VariantA />
	{/if}
</div>

<PrototypeSwitcher {variants} current={v} status={db.log} />
