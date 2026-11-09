<script lang="ts">
	// PROTOTYPE, throwaway. Shows the Entries the form would save, so every variant surfaces state.
	import { formatAmount } from '#lib/domain/index.ts';
	import type { Evaluated, Leaf } from './proto.ts';

	let { ev, leaves, date, description }: { ev: Evaluated; leaves: Leaf[]; date: string; description: string } =
		$props();
	const name = (id: string) => leaves.find((l) => l.id === id)?.path ?? '(no Account)';
</script>

<details open class="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
	<summary class="cursor-pointer font-semibold">Prototype state: what would be saved</summary>
	<p class="mt-2">{date || '(no date)'} · {description || '(no Description)'} · kind: {ev.kind ?? '—'}</p>
	<table class="mt-2 w-full tabular-nums">
		<tbody>
			{#each ev.entries as e, i (i)}
				<tr>
					<td class="pr-4">{name(e.accountId)}</td>
					<td class="text-right">{e.amount} centavos</td>
					<td class="pl-4 text-right text-gray-400">{formatAmount(e.amount)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="mt-2">Sum of Entries: {ev.entries.reduce((s, e) => s + e.amount, 0)} (must be 0)</p>
	{#if ev.errors.length}
		<ul class="mt-2 list-disc pl-5 text-rose-700">
			{#each ev.errors as err (err)}<li>{err}</li>{/each}
		</ul>
	{/if}
</details>
