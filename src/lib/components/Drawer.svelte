<script lang="ts">
	// A side drawer on the right of a page. Drag its left edge (or focus it and use the arrow
	// keys) to resize; the width is remembered per drawer on this browser.
	import type { Snippet } from 'svelte';

	let {
		id,
		width: initial = 384,
		children
	}: { id: string; width?: number; children: Snippet } = $props();

	const MIN = 320;
	const max = () => Math.max(MIN, Math.round(window.innerWidth * 0.8));
	const clamp = (w: number) => Math.min(max(), Math.max(MIN, Math.round(w)));
	const key = $derived(`perancial.drawer.${id}`);

	function stored(): number | null {
		try {
			const v = Number(localStorage.getItem(key));
			return v > 0 ? v : null;
		} catch {
			return null;
		}
	}
	// svelte-ignore state_referenced_locally
	let width = $state(clamp(stored() ?? initial));
	function remember() {
		try {
			localStorage.setItem(key, String(width));
		} catch {
			// Private windows can refuse storage; the width just isn't remembered.
		}
	}

	let dragging = $state(false);
	function down(e: PointerEvent) {
		e.preventDefault();
		dragging = true;
		const startX = e.clientX;
		const startW = width;
		const handle = e.currentTarget as HTMLElement;
		handle.setPointerCapture(e.pointerId);
		const move = (m: PointerEvent) => (width = clamp(startW + startX - m.clientX));
		const up = () => {
			dragging = false;
			handle.removeEventListener('pointermove', move);
			handle.removeEventListener('pointerup', up);
			handle.removeEventListener('pointercancel', up);
			remember();
		};
		handle.addEventListener('pointermove', move);
		handle.addEventListener('pointerup', up);
		handle.addEventListener('pointercancel', up);
	}
	function key_(e: KeyboardEvent) {
		const step = e.shiftKey ? 96 : 32;
		if (e.key === 'ArrowLeft') width = clamp(width + step);
		else if (e.key === 'ArrowRight') width = clamp(width - step);
		else if (e.key === 'Home') width = clamp(initial);
		else return;
		e.preventDefault();
		remember();
	}
</script>

<svelte:window onresize={() => (width = clamp(width))} />

<div
	class="sticky top-0 h-screen shrink-0 border-l bg-white shadow-xl {dragging ? 'select-none' : ''}"
	style:width="{width}px"
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<div
		role="separator"
		aria-orientation="vertical"
		aria-label="Resize panel"
		aria-valuenow={width}
		aria-valuemin={MIN}
		tabindex="0"
		title="Drag to resize"
		class="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-sky-300 focus:bg-sky-400 focus:outline-none {dragging
			? 'bg-sky-400'
			: ''}"
		onpointerdown={down}
		onkeydown={key_}
		ondblclick={() => {
			width = clamp(initial);
			remember();
		}}
	></div>
	<div class="h-full overflow-y-auto p-6">{@render children()}</div>
</div>
