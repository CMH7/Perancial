<script lang="ts">
	// A plan's Forecast Section: one of the owner's Sections, or "Derived" (none). Liability
	// Sections are never picked by hand, so they don't appear here.
	import { resolve } from '$app/paths';
	import { forecastSections } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let {
		value,
		onchange,
		class: klass = 'mt-1 w-full rounded border-gray-300 py-1 text-sm'
	}: {
		value: string | null | undefined;
		onchange: (id: string | null) => void;
		class?: string;
	} = $props();

	const lists = $derived(forecastSections(ledger.forecastSettings));
	/** A Section that was deleted reads as Derived. */
	const known = $derived(
		[...lists.outflowSections, ...lists.inflowSections].some((s) => s.id === value)
	);
</script>

<label class="block"
	>Forecast Section
	<select
		class={klass}
		value={known ? value : ''}
		onchange={(e) => onchange(e.currentTarget.value || null)}
	>
		<option value="">Derived (from its Accounts)</option>
		<optgroup label="Outflow Sections">
			{#each lists.outflowSections as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
		</optgroup>
		<optgroup label="Inflow Sections">
			{#each lists.inflowSections.filter((s) => !lists.outflowSections.some((o) => o.id === s.id)) as s (s.id)}<option
					value={s.id}>{s.name}</option
				>{/each}
		</optgroup>
	</select>
	<span class="text-xs text-gray-500"
		>Manage Sections in <a class="underline" href={resolve('/settings')}>Settings</a>.</span
	>
</label>
