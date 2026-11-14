<script lang="ts">
	// The wallet's toolbar: search box (press / to focus it), a filter button that shows or hides
	// the filter chips, and "+ New". While the chips are hidden, the picked one stays visible as a
	// small removable pill.
	let {
		query = $bindable(''),
		filter = $bindable(''),
		filters,
		shown,
		total,
		autofocus = false,
		onadd
	}: {
		query?: string;
		/** The picked chip's key; "" is All. */
		filter?: string;
		/** Chips after All; none shown when there is only one. */
		filters: { key: string; label: string }[];
		shown: number;
		total: number;
		autofocus?: boolean;
		/** When set, a "+ New" button after the chips. */
		onadd?: () => void;
	} = $props();
	let input: HTMLInputElement | undefined = $state();
	let showFilters = $state(false);
	const picked = $derived(filters.find((f) => f.key === filter));
	$effect(() => {
		if (autofocus) input?.focus();
	});
</script>

<svelte:window
	onkeydown={(e) => {
		const t = e.target as HTMLElement;
		if (e.key === '/' && !t.closest('input, textarea, select, [contenteditable]')) {
			e.preventDefault();
			input?.focus();
		}
	}}
/>

<div class="flex items-center gap-2 text-sm">
	<div class="relative min-w-0 flex-1">
		<input
			bind:this={input}
			bind:value={query}
			placeholder="Search cards…"
			aria-label="Search cards"
			class="w-full rounded-lg border-gray-300 py-1.5 pr-14 pl-3 text-sm"
			onkeydown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), (query = ''))}
		/>
		<span
			class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-gray-400"
			>{#if query || filter}{shown}/{total}{:else}<kbd class="rounded border px-1">/</kbd
				>{/if}</span
		>
	</div>
	{#if filters.length > 1}
		<button
			type="button"
			class="relative grid size-8 shrink-0 place-items-center rounded-lg border {showFilters
				? 'border-gray-900 bg-gray-900 text-white'
				: 'border-gray-300 text-gray-600 hover:bg-gray-100'}"
			aria-label="Filter by Group"
			aria-expanded={showFilters}
			title="Filter by Group"
			onclick={() => (showFilters = !showFilters)}
		>
			<svg viewBox="0 0 20 20" class="size-4" fill="none" stroke="currentColor" stroke-width="1.6"
				><path d="M3 5h14M6 10h8M9 15h2" stroke-linecap="round" /></svg
			>
			{#if filter && !showFilters}<span
					class="absolute -top-1 -right-1 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
					aria-hidden="true"
				></span>{/if}
		</button>
	{/if}
	{#if onadd}
		<button
			type="button"
			class="shrink-0 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white"
			onclick={onadd}>+ New</button
		>
	{/if}
</div>
{#if filters.length > 1 && showFilters}
	<div class="mt-2 flex flex-wrap gap-1 text-xs">
		{#each [{ key: '', label: 'All' }, ...filters] as c (c.key)}
			<button
				type="button"
				class="rounded-full border px-2.5 py-0.5 {filter === c.key
					? 'border-gray-900 bg-gray-900 text-white'
					: 'text-gray-600 hover:bg-gray-100'}"
				onclick={() => (filter = c.key)}>{c.label}</button
			>
		{/each}
	</div>
{/if}
{#if !showFilters && picked}
	<div class="mt-2 text-xs">
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded-full border border-gray-900 bg-gray-900 py-0.5 pr-1.5 pl-2.5 text-white"
			title="Show all cards"
			onclick={() => (filter = '')}
			>{picked.label}<span class="opacity-60" aria-hidden="true">✕</span><span class="sr-only"
				>, clear filter</span
			></button
		>
	</div>
{/if}
