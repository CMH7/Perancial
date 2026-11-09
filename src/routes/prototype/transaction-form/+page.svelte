<script lang="ts">
	// PROTOTYPE, throwaway (ticket #30 "Transaction form"): three variants of the Transaction form,
	// switchable via ?variant=A|B|C. Uses your real Leaf Accounts when signed in, stubs otherwise.
	// Nothing is saved.
	import { page } from '$app/state';
	import PrototypeSwitcher from '#lib/components/PrototypeSwitcher.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { leavesFrom, STUB_LEAVES, STUB_RECENT } from './proto.ts';
	import VariantA, { name as nameA } from './VariantA.svelte';
	import VariantB, { name as nameB } from './VariantB.svelte';
	import VariantC, { name as nameC } from './VariantC.svelte';

	const real = $derived(leavesFrom(ledger.accounts));
	// Stub recent Transactions reference stub Account IDs, so stay on stubs for a coherent demo.
	const leaves = $derived(real.length > 3 && page.url.searchParams.has('real') ? real : STUB_LEAVES);
	const variant = $derived(page.url.searchParams.get('variant') ?? 'A');
</script>

{#key variant}
	{#if variant === 'B'}
		<VariantB {leaves} recent={STUB_RECENT} />
	{:else if variant === 'C'}
		<VariantC {leaves} recent={STUB_RECENT} />
	{:else}
		<VariantA {leaves} recent={STUB_RECENT} />
	{/if}
{/key}

<div class="h-16"></div>
<PrototypeSwitcher
	variants={[
		{ key: 'A', name: nameA },
		{ key: 'B', name: nameB },
		{ key: 'C', name: nameC }
	]}
/>
