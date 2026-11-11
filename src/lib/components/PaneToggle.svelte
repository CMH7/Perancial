<script lang="ts">
	// The hide / show button for a SplitPane's left pane.
	let { collapsed = $bindable(false), label }: { collapsed?: boolean; label: string } = $props();
</script>

<button
	onclick={() => (collapsed = !collapsed)}
	class="grid size-7 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900"
	title="{collapsed ? 'Show' : 'Hide'} {label} ( [ )"
	aria-label="{collapsed ? 'Show' : 'Hide'} {label}"
	aria-expanded={!collapsed}
>
	<svg
		viewBox="0 0 16 16"
		class="size-4"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		aria-hidden="true"
		><rect x="2" y="2.5" width="12" height="11" rx="2" /><path d="M6 2.5v11" /></svg
	>
</button>
