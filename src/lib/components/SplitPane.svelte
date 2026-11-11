<script lang="ts">
	// The list-and-detail shell the Accounts, Journal, Scheduled and Installments pages share: a left
	// pane beside the main area, filling the window under the nav bar, each scrolling on its own.
	// The pane collapses to a slim strip (its own toggle, or `[`), remembered per page on this
	// browser. The pane snippet draws both states; it reads `collapsed` to know which.
	import type { Snippet } from 'svelte';

	let {
		storageKey,
		collapsed = $bindable(false),
		width = '24rem',
		pane,
		children
	}: {
		/** localStorage key for the collapsed state. */
		storageKey: string;
		collapsed?: boolean;
		width?: string;
		pane: Snippet;
		children: Snippet;
	} = $props();

	// Private windows can refuse storage; the state just isn't remembered.
	try {
		// svelte-ignore state_referenced_locally
		collapsed = localStorage.getItem(storageKey) === '1';
	} catch {
		/* not remembered */
	}
	$effect(() => {
		try {
			localStorage.setItem(storageKey, collapsed ? '1' : '0');
		} catch {
			/* not remembered */
		}
	});

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey) return;
		const t = e.target;
		if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
		if (document.querySelector('dialog[open]')) return;
		collapsed = !collapsed;
	}
</script>

<svelte:window {onkeydown} />

<div
	class="grid h-[calc(100vh-var(--nav-h))] overflow-hidden transition-[grid-template-columns] duration-200"
	style="grid-template-columns: {collapsed ? '3rem' : width} minmax(0, 1fr)"
>
	<div class="min-h-0 overflow-hidden">{@render pane()}</div>
	<div class="min-h-0 overflow-y-auto bg-gray-50">{@render children()}</div>
</div>
