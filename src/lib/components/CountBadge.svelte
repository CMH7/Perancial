<script lang="ts">
	// A small count pinned to the top-right corner of its (relative) parent, such as an icon
	// button. Hidden at zero; above `max` it shows "max+".
	let { count, max = 99, label }: { count: number; max?: number; label?: string } = $props();
</script>

{#if count > 0}
	<span
		class="pointer-events-none absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white tabular-nums ring-2 ring-white"
		aria-label={label ?? `${count} new`}>{count > max ? `${max}+` : count}</span
	>
{/if}
