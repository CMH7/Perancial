<script lang="ts">
	// PROTOTYPE tooling: floating bar that cycles `?variant=` (arrows or ←/→). Dev builds only.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { variants }: { variants: { key: string; name: string }[] } = $props();
	const current = $derived(page.url.searchParams.get('variant') ?? variants[0].key);
	const index = $derived(Math.max(0, variants.findIndex((v) => v.key === current)));

	function go(step: number) {
		const next = variants[(index + step + variants.length) % variants.length];
		const url = new URL(page.url.href);
		url.searchParams.set('variant', next.key);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, query only
		goto(url, { replaceState: true });
	}

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'ArrowLeft') go(-1);
		if (e.key === 'ArrowRight') go(1);
	}
</script>

<svelte:window {onkeydown} />

{#if import.meta.env.DEV}
	<div class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-fuchsia-700 px-4 py-2 text-sm text-white shadow-xl">
		<button onclick={() => go(-1)} aria-label="Previous variant">←</button>
		<span class="font-mono">{variants[index].key} ({variants[index].name})</span>
		<button onclick={() => go(1)} aria-label="Next variant">→</button>
	</div>
{/if}
