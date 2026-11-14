<script lang="ts">
	// The wallet's toolbar: search box (press / to focus it), filter chips, and "+ New".
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
	{#if onadd}
		<button
			type="button"
			class="shrink-0 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white"
			onclick={onadd}>+ New</button
		>
	{/if}
</div>
{#if filters.length > 1}
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
