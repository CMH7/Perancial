<script lang="ts">
	// An amount in display sign: Abnormal Balances get a minus and the warning colour.
	import { formatAmount, isAbnormal } from '#lib/domain/index.ts';

	let { value, bold = false }: { value: number; bold?: boolean } = $props();
	const abnormal = $derived(isAbnormal(value));
</script>

<span
	class="whitespace-nowrap tabular-nums {abnormal ? 'text-amber-600' : ''} {bold
		? 'font-semibold'
		: ''}"
	title={abnormal ? 'Abnormal Balance' : undefined}>{formatAmount(value)}</span
>
