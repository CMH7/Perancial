<script lang="ts">
	// PROTOTYPE — floating variant switcher. Dev builds only.
	import { goto } from '$app/navigation';
	import { dev } from '$app/env';

	let { variants, current, status = '' }: { variants: { key: string; name: string }[]; current: string; status?: string } =
		$props();

	const idx = $derived(Math.max(0, variants.findIndex((v) => v.key === current)));
	const cur = $derived(variants[idx]);

	function step(d: number) {
		const next = variants[(idx + d + variants.length) % variants.length];
		const url = new URL(location.href);
		url.searchParams.set('variant', next.key);
		goto(url, { replace: true });
	}

	function onkeydown(e: KeyboardEvent) {
		const el = e.target as HTMLElement;
		if (el.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'ArrowLeft') step(-1);
		if (e.key === 'ArrowRight') step(1);
	}
</script>

<svelte:window {onkeydown} />

{#if dev}
	<div class="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-fuchsia-600 px-2 py-1.5 text-sm text-white shadow-2xl ring-4 ring-fuchsia-200">
		<div class="flex items-center gap-2">
			<button onclick={() => step(-1)} class="rounded-full px-2 hover:bg-fuchsia-500">←</button>
			<span class="font-mono">{cur.key} ({cur.name})</span>
			<button onclick={() => step(1)} class="rounded-full px-2 hover:bg-fuchsia-500">→</button>
			{#if status}<span class="max-w-80 truncate border-l border-fuchsia-400 pr-2 pl-2 text-xs opacity-90">{status}</span>{/if}
		</div>
	</div>
{/if}
