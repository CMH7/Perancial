<script lang="ts">
	// PROTOTYPE ONLY: floating bar that flips between UI variants via the `?variant=` search
	// param. Hidden outside the dev server so a stray merge can't ship it.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let {
		variants,
		current
	}: { variants: ReadonlyArray<{ key: string; name: string }>; current: string } = $props();

	const index = $derived(Math.max(0, variants.findIndex((v) => v.key === current)));
	const label = $derived(variants[index]);

	function go(step: number) {
		const next = variants[(index + step + variants.length) % variants.length];
		const url = new URL(page.url.href);
		url.searchParams.set('variant', next.key);
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		goto(url, { replace: true, reset: false });
	}

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (t?.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'ArrowLeft') go(-1);
		if (e.key === 'ArrowRight') go(1);
	}
</script>

<svelte:window {onkeydown} />

{#if import.meta.env.DEV}
	<div
		class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 p-1 text-sm text-white shadow-xl ring-4 ring-fuchsia-300/50"
	>
		<button
			onclick={() => go(-1)}
			class="rounded-full px-3 py-1 hover:bg-fuchsia-500"
			aria-label="Previous variant">←</button
		>
		<span class="px-2 font-medium whitespace-nowrap"
			>{label.key} <span class="opacity-80">({label.name})</span></span
		>
		<button
			onclick={() => go(1)}
			class="rounded-full px-3 py-1 hover:bg-fuchsia-500"
			aria-label="Next variant">→</button
		>
	</div>
{/if}
