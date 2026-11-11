<script lang="ts">
	// The nav bar's notifications button: a bell with an unread count, opening a small panel.
	// In-app notifications don't exist yet, so the count is 0 and the panel says so; the panel's
	// content is the place for the list once they do.
	import CountBadge from './CountBadge.svelte';

	let { count = 0 }: { count?: number } = $props();
	let open = $state(false);
	let root = $state<HTMLElement>();

	function onclick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
	}
</script>

<svelte:window {onclick} {onkeydown} />

<div class="relative" bind:this={root}>
	<button
		onclick={() => (open = !open)}
		class="relative grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 {open
			? 'bg-gray-100 text-gray-900'
			: ''}"
		aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
		aria-haspopup="true"
		aria-expanded={open}
		title="Notifications"
	>
		<svg
			viewBox="0 0 24 24"
			class="size-5"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
			><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path
				d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
			/></svg
		>
		<CountBadge {count} />
	</button>

	{#if open}
		<div
			class="absolute right-0 z-40 mt-2 w-80 rounded-xl border bg-white text-sm shadow-lg"
			role="dialog"
			aria-label="Notifications"
		>
			<div class="border-b px-4 py-2.5 font-semibold">Notifications</div>
			<p class="px-4 py-8 text-center text-gray-500">You're all caught up.</p>
		</div>
	{/if}
</div>
