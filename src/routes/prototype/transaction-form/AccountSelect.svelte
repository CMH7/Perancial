<script lang="ts">
	// PROTOTYPE, throwaway. Plain grouped <select> of Leaf Accounts; the real picker is its own question.
	import type { AccountType } from '#lib/domain/index.ts';
	import type { Leaf } from './proto.ts';

	let {
		value = $bindable(),
		leaves,
		only,
		class: cls = ''
	}: { value: string; leaves: Leaf[]; only?: AccountType[]; class?: string } = $props();

	const TYPES: [AccountType, string][] = [
		['asset', 'Assets'],
		['liability', 'Liabilities'],
		['income', 'Income'],
		['expense', 'Expenses'],
		['equity', 'Equity']
	];
</script>

<select bind:value class="rounded border-gray-300 py-1 text-sm {cls}">
	<option value="">Choose Account…</option>
	{#each TYPES.filter(([t]) => !only || only.includes(t)) as [type, label] (type)}
		<optgroup {label}>
			{#each leaves.filter((l) => l.type === type) as l (l.id)}
				<option value={l.id}>{l.path.split(' › ').slice(1).join(' › ')}</option>
			{/each}
		</optgroup>
	{/each}
</select>
