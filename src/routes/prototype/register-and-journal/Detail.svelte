<script lang="ts">
	// PROTOTYPE, throwaway. Transaction detail content; each variant decides where it appears.
	import { formatAmount } from '#lib/domain/index.ts';
	import { destinations, KIND_STYLE, kindOfTx, pathOf, sources, total, type Tx } from './proto.ts';

	let { tx, compact = false }: { tx: Tx; compact?: boolean } = $props();
	const kind = $derived(kindOfTx(tx));
	const act = (what: string) => alert(`Prototype: ${what} (not built)`);
</script>

<div class="text-sm">
	{#if !compact}
		<p class="text-xs text-gray-500">{tx.date ?? 'Opening Balance'}</p>
		<h2 class="text-xl font-semibold">{tx.description}</h2>
	{/if}
	<div class="mt-2 flex flex-wrap items-center gap-2">
		{#if kind && kind !== 'Opening Balance'}
			<span class="rounded-full px-2 py-0.5 text-xs {KIND_STYLE[kind]}">{kind}</span>
		{/if}
		<span class="rounded-full px-2 py-0.5 text-xs {tx.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}">{tx.status}</span>
		{#each tx.tags as t (t)}<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">#{t}</span>{/each}
		<span class="ml-auto font-semibold tabular-nums">{formatAmount(total(tx))}</span>
	</div>

	<div class="mt-4 grid grid-cols-2 gap-4">
		<div>
			<p class="mb-1 text-xs font-semibold text-gray-500 uppercase">From</p>
			{#each sources(tx) as e, i (i)}
				<p class="flex justify-between gap-2"><span class="truncate" title={pathOf(e.accountId)}>{pathOf(e.accountId).split(' › ').slice(1).join(' › ') || pathOf(e.accountId)}</span><span class="tabular-nums">{formatAmount(-e.amount)}</span></p>
			{/each}
		</div>
		<div>
			<p class="mb-1 text-xs font-semibold text-gray-500 uppercase">To</p>
			{#each destinations(tx) as e, i (i)}
				<p class="flex justify-between gap-2"><span class="truncate" title={pathOf(e.accountId)}>{pathOf(e.accountId).split(' › ').slice(1).join(' › ') || pathOf(e.accountId)}</span><span class="tabular-nums">{formatAmount(e.amount)}</span></p>
			{/each}
		</div>
	</div>

	{#if tx.note}
		<div class="mt-4 rounded bg-yellow-50 p-3 whitespace-pre-line text-gray-700">{tx.note}</div>
	{:else if !compact}
		<p class="mt-4 text-xs text-gray-400">No Note.</p>
	{/if}

	{#if tx.date}
		<div class="mt-4 flex gap-2">
			<button class="rounded border px-3 py-1 hover:bg-gray-50" onclick={() => act('Edit')}>Edit</button>
			<button class="rounded border px-3 py-1 hover:bg-gray-50" onclick={() => act('Duplicate')}>Duplicate</button>
			<button class="rounded border px-3 py-1 text-rose-700 hover:bg-rose-50" onclick={() => act('Delete')}>Delete</button>
		</div>
	{/if}
</div>
