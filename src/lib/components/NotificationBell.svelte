<script lang="ts">
	// The nav bar's notifications button: a bell with an unread count that opens the notifications
	// drawer. In-app notifications don't exist yet, so the count is 0 and the drawer says so; its
	// body is the place for the list once they do.
	import CountBadge from './CountBadge.svelte';
	import Drawer from './Drawer.svelte';

	let { count = 0 }: { count?: number } = $props();
	let open = $state(false);
</script>

<button
	data-overlay-keep
	onclick={() => (open = !open)}
	class="relative grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 {open
		? 'bg-gray-100 text-gray-900'
		: ''}"
	aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
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
	<Drawer id="notifications" width={360} label="Notifications" onclose={() => (open = false)}>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-lg font-semibold">Notifications</h2>
			<button
				onclick={() => (open = false)}
				class="text-gray-400 hover:text-gray-900"
				aria-label="Close">✕</button
			>
		</div>
		<p class="py-12 text-center text-sm text-gray-500">You're all caught up.</p>
	</Drawer>
{/if}
