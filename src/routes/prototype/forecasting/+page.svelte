<script lang="ts">
	// PROTOTYPE (throwaway, never merge): three layouts of one Forecast on /prototype/forecasting,
	// switchable via ?variant=A|B|C. Made-up data in memory; buttons only change memory.
	import { page } from '$app/state';
	import PrototypeSwitcher from '#lib/components/PrototypeSwitcher.svelte';
	import VariantA from './VariantA.svelte';
	import VariantB from './VariantB.svelte';
	import VariantC from './VariantC.svelte';
	import { f, fmt, fundedWindow, peso, shiftCutoff, totals } from './stub.svelte.ts';

	const variants = [
		{ key: 'A', name: 'Sheet' },
		{ key: 'B', name: 'Account lanes' },
		{ key: 'C', name: 'Checklist' }
	];
	const variant = $derived(page.url.searchParams.get('variant') ?? 'A');
	const t = $derived(totals());
</script>

<div class="bg-fuchsia-50 px-6 py-1 text-xs text-fuchsia-700">
	Prototype: made-up data, nothing is saved.
</div>

<main class="mx-auto max-w-7xl px-4 py-6 pb-24">
	<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
		<div>
			<div class="flex items-center gap-2">
				<button class="rounded border px-2 py-0.5" onclick={() => shiftCutoff(-1)}>←</button>
				<h1 class="text-2xl font-semibold">Forecast · {fmt(f.cutoff, true)}</h1>
				<button class="rounded border px-2 py-0.5" onclick={() => shiftCutoff(1)}>→</button>
				<input type="date" class="rounded border px-1 text-sm" aria-label="Jump to a Cut-off" />
			</div>
			<p class="text-sm text-gray-500">
				Pay received up to {fmt(f.cutoff)} funds what's due {fundedWindow(f.cutoff)}. (Stub data
				doesn't change with the Cut-off.)
			</p>
		</div>
		<div class="flex gap-2 text-sm">
			<div class="rounded-lg border bg-white px-3 py-1.5">
				Outflows <b class="tabular-nums">{peso(t.outflows)}</b>
				<span class="text-gray-500">· paid {peso(t.paid)}</span>
			</div>
			<div class="rounded-lg border px-3 py-1.5 {t.unfunded ? 'border-amber-300 bg-amber-50 text-amber-800' : 'bg-white'}">
				Unfunded <b class="tabular-nums">{peso(t.unfunded)}</b>
			</div>
			<div class="rounded-lg border px-3 py-1.5 {t.short ? 'border-red-300 bg-red-50 text-red-700' : 'bg-white'}">
				Short <b class="tabular-nums">{peso(t.short)}</b>
			</div>
		</div>
	</div>

	{#if variant === 'A'}<VariantA />{:else if variant === 'B'}<VariantB />{:else}<VariantC />{/if}
</main>

<PrototypeSwitcher {variants} />
