<script lang="ts">
	// PROTOTYPE, throwaway ("Installments screens" ticket): three variants of the Installments
	// screens, switchable via ?variant=A|B|C, on stub plans from the owner's Google Sheet plus an
	// internal plan. "New plan" opens one shared rough create form. Nothing is saved.
	import { page } from '$app/state';
	import PrototypeSwitcher from '#lib/components/PrototypeSwitcher.svelte';
	import NewPlan from './NewPlan.svelte';
	import { PLANS } from './proto.ts';
	import VariantA, { name as nameA } from './VariantA.svelte';
	import VariantB, { name as nameB } from './VariantB.svelte';
	import VariantC, { name as nameC } from './VariantC.svelte';

	let plans = $state(structuredClone(PLANS));
	let creating = $state(false);
	const variant = $derived(page.url.searchParams.get('variant') ?? 'A');
	const onNew = () => (creating = true);
</script>

{#key variant}
	{#if variant === 'B'}
		<VariantB bind:plans {onNew} />
	{:else if variant === 'C'}
		<VariantC bind:plans {onNew} />
	{:else}
		<VariantA bind:plans {onNew} />
	{/if}
{/key}

{#if creating}
	<NewPlan
		onClose={() => (creating = false)}
		onSave={(p) => {
			plans.push(p);
			creating = false;
		}}
	/>
{/if}

<div class="h-16"></div>
<PrototypeSwitcher
	variants={[
		{ key: 'A', name: nameA },
		{ key: 'B', name: nameB },
		{ key: 'C', name: nameC }
	]}
/>
