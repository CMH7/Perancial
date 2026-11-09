<script lang="ts">
	// PROTOTYPE — Variant B: sidebar tree navigator + detail pane for the selected Account; form in a modal.
	import { TYPES, byId, childrenOf, isGroup, balance, totals, pathOf, doArchive, doDelete, type Account } from './data.svelte';
	import Amount from './Amount.svelte';
	import AccountForm from './AccountForm.svelte';
	import MoveForm from './MoveForm.svelte';

	let selected = $state('asset');
	let showArchived = $state(false);
	type Modal = { kind: 'create'; parentId: string } | { kind: 'edit'; id: string } | { kind: 'move'; id: string } | null;
	let modal = $state<Modal>(null);

	const t = $derived(totals());
	const acc = $derived(byId(selected) ?? byId('asset'));
	const kids = $derived(childrenOf(acc.id, showArchived));
	const total = $derived(balance(acc.id));
</script>

{#snippet node(a: Account, depth: number)}
	<button
		onclick={() => (selected = a.id)}
		class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm {selected === a.id ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-100'} {a.archived ? 'opacity-50' : ''}"
		style="padding-left: {0.5 + depth * 0.9}rem"
	>
		<span class="truncate {isGroup(a) ? 'font-medium' : ''}">{a.name}</span>
		<span class="ml-2 text-xs text-gray-500"><Amount c={balance(a.id)} /></span>
	</button>
	{#each childrenOf(a.id, showArchived) as k (k.id)}
		{@render node(k, depth + 1)}
	{/each}
{/snippet}

<div class="flex h-screen">
	<aside class="w-80 shrink-0 overflow-y-auto border-r bg-white p-3">
		<div class="mb-3 rounded bg-gray-900 p-3 text-white">
			<div class="text-xs text-gray-400">Net Worth</div>
			<div class="text-xl"><Amount c={t.netWorth} bold /></div>
			<div class="mt-1 flex justify-between text-xs text-gray-400">
				<span>Assets <Amount c={t.assets} /></span>
				<span>Liab. <Amount c={t.liabilities} /></span>
			</div>
		</div>
		{#each TYPES as ty (ty.type)}
			<div class="mb-2">{@render node(byId(ty.type), 0)}</div>
		{/each}
		<label class="mt-4 flex items-center gap-2 px-2 text-xs text-gray-600"><input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived</label>
	</aside>

	<main class="flex-1 overflow-y-auto bg-gray-50 p-8">
		<nav class="mb-2 text-sm text-gray-500">
			{#each pathOf(acc.id) as p, i (p.id)}
				{#if i > 0}<span class="mx-1">›</span>{/if}
				<button onclick={() => (selected = p.id)} class="hover:underline">{p.name}</button>
			{/each}
		</nav>
		<div class="mb-6 flex items-start justify-between">
			<div>
				<h1 class="text-3xl font-semibold">
					{acc.name}
					<span class="ml-2 rounded bg-gray-200 px-2 py-0.5 align-middle text-xs font-normal text-gray-600">{acc.type}</span>
					{#if acc.archived}<span class="ml-1 rounded bg-gray-200 px-2 py-0.5 align-middle text-xs font-normal">archived</span>{/if}
				</h1>
				<p class="mt-1 text-gray-500">{acc.description || '—'}</p>
			</div>
			<div class="text-right">
				<div class="text-xs text-gray-500 uppercase">{isGroup(acc) ? 'Total of children' : 'Balance'}</div>
				<div class="text-3xl"><Amount c={total} bold /></div>
			</div>
		</div>

		<div class="mb-4 flex gap-2 text-sm">
			{#if acc.system !== 'opening-balances'}
				<button onclick={() => (modal = { kind: 'create', parentId: acc.id })} class="rounded bg-gray-900 px-3 py-1.5 text-white">+ Add child</button>
				<button onclick={() => (modal = { kind: 'edit', id: acc.id })} class="rounded border bg-white px-3 py-1.5">Edit</button>
			{/if}
			{#if !acc.system}
				<button onclick={() => (modal = { kind: 'move', id: acc.id })} class="rounded border bg-white px-3 py-1.5">Move</button>
				<button onclick={() => doArchive(acc.id)} class="rounded border bg-white px-3 py-1.5">{acc.archived ? 'Unarchive' : 'Archive'}</button>
				<button onclick={() => doDelete(acc.id) && (selected = acc.parentId ?? 'asset')} class="rounded border bg-white px-3 py-1.5 text-red-600">Delete</button>
			{/if}
		</div>

		{#if kids.length}
			<table class="w-full overflow-hidden rounded-lg border bg-white text-sm">
				<thead class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
					<tr><th class="px-4 py-2">Child account</th><th class="px-4 py-2">Description</th><th class="px-4 py-2 text-right">Share</th><th class="px-4 py-2 text-right">Balance</th></tr>
				</thead>
				<tbody>
					{#each kids as k (k.id)}
						{@const b = balance(k.id)}
						<tr class="cursor-pointer border-t hover:bg-gray-50 {k.archived ? 'opacity-50' : ''}" onclick={() => (selected = k.id)}>
							<td class="px-4 py-2 {isGroup(k) ? 'font-semibold' : ''}">{k.name}{isGroup(k) ? ` (${childrenOf(k.id).length})` : ''}</td>
							<td class="px-4 py-2 text-gray-500">{k.description}</td>
							<td class="px-4 py-2 text-right text-gray-500 tabular-nums">{total ? Math.round((b / total) * 100) : 0}%</td>
							<td class="px-4 py-2 text-right"><Amount c={b} bold={isGroup(k)} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<div class="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-gray-500">
				Leaf Account: holds money directly. Transactions will list here (next module).
			</div>
		{/if}
	</main>
</div>

{#if modal}
	<div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
		<div class="max-h-[90vh] w-[36rem] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
			{#if modal.kind === 'move'}
				<MoveForm accountId={modal.id} onclose={() => (modal = null)} />
			{:else if modal.kind === 'edit'}
				<AccountForm mode="edit" accountId={modal.id} onclose={() => (modal = null)} />
			{:else}
				<AccountForm mode="create" parentId={modal.parentId} onclose={() => (modal = null)} />
			{/if}
		</div>
	</div>
{/if}
