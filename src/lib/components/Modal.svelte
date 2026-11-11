<script lang="ts">
	// Centred modal on the native <dialog>: focus trap and a backdrop for free. Closes from its own
	// buttons or Esc (when it is the most recent overlay), never from a click on the backdrop.
	import type { Snippet } from 'svelte';
	import { openLayer } from '#lib/overlays.svelte.ts';

	let { onclose, children }: { onclose: () => void; children: Snippet } = $props();
	let dialog: HTMLDialogElement;

	$effect(() => {
		dialog.showModal();
		const remove = openLayer({ kind: 'dialog', close: () => onclose() });
		return () => {
			remove();
			dialog.close();
		};
	});
</script>

<dialog
	bind:this={dialog}
	oncancel={(e) => e.preventDefault()}
	class="m-auto max-h-[90vh] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl backdrop:bg-black/30"
>
	{@render children()}
</dialog>
