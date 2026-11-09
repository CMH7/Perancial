<script lang="ts">
	// PROTOTYPE, throwaway (ticket #31 "Account register and Journal"): three variants of the
	// register, Journal and Transaction detail, switchable via ?variant=A|B|C. Stub data only.
	import { page } from '$app/state';
	import PrototypeSwitcher from '#lib/components/PrototypeSwitcher.svelte';
	import VariantA, { name as nameA } from './VariantA.svelte';
	import VariantB, { name as nameB } from './VariantB.svelte';
	import VariantC, { name as nameC } from './VariantC.svelte';

	const variant = $derived(page.url.searchParams.get('variant') ?? 'A');
</script>

{#key variant}
	{#if variant === 'B'}<VariantB />{:else if variant === 'C'}<VariantC />{:else}<VariantA />{/if}
{/key}

<div class="h-16"></div>
<PrototypeSwitcher
	variants={[
		{ key: 'A', name: nameA },
		{ key: 'B', name: nameB },
		{ key: 'C', name: nameC }
	]}
/>
