<script lang="ts">
	// Centred modal on the native <dialog>: focus trap, Esc to close, and a backdrop for free.
	import type { Snippet } from 'svelte';

	let { onclose, children }: { onclose: () => void; children: Snippet } = $props();
	let dialog: HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		return () => dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	{onclose}
	onclick={(e) => e.target === dialog && onclose()}
	class="m-auto max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl backdrop:bg-black/30"
>
	{@render children()}
</dialog>
