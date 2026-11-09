<script lang="ts">
	// PROTOTYPE — amount display: normal Balance positive, Abnormal Balance minus + warning colour.
	import { fmt } from './data.svelte';
	let { c, bold = false }: { c: number; bold?: boolean } = $props();
</script>

<span
	class="tabular-nums {c < 0 ? 'text-amber-600' : ''} {bold ? 'font-semibold' : ''}"
	title={c < 0 ? 'Abnormal Balance' : undefined}>{fmt(c)}</span
>
