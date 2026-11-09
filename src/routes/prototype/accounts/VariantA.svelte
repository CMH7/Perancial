<script lang="ts">
	// PROTOTYPE — Variant A: one big tree table, everything visible; form in a right-side drawer.
	import { TYPES, byId, childrenOf, isGroup, balance, totals, doArchive, doDelete, type Account } from './data.svelte';
	import Amount from './Amount.svelte';
	import AccountForm from './AccountForm.svelte';
	import MoveForm from './MoveForm.svelte';

	let showArchived = $state(false);
	let collapsed = $state<Record<string, boolean>>({});
	type Panel = { kind: 'create'; parentId: string } | { kind: 'edit'; id: string } | { kind: 'move'; id: string } | null;
	let panel = $state<Panel>(null);

	const rows = $derived.by(() => {
		const out: { acc: Account; depth: number }[] = [];
		const walk = (acc: Account, depth: number) => {
			out.push({ acc, depth });
			if (!collapsed[acc.id]) for (const k of childrenOf(acc.id, showArchived)) walk(k, depth + 1);
		};
		for (const t of TYPES) walk(byId(t.type), 0);
		return out;
	});
	const t = $derived(totals());

	const setAll = (v: boolean) => {
		const next: Record<string, boolean> = {};
		for (const r of rows) if (isGroup(r.acc) && r.acc.system !== 'root') next[r.acc.id] = v;
		collapsed = next;
	};
</script>

<div class="mx-auto max-w-6xl p-8">
	<h1 class="mb-6 text-2xl font-semibold">Chart of Accounts</h1>

	<div class="mb-6 grid grid-cols-3 gap-4">
		{#each [['Total Assets', t.assets], ['Total Liabilities', t.liabilities], ['Net Worth', t.netWorth]] as [label, v] (label)}
			<div class="rounded-lg border bg-white p-4">
				<div class="text-xs tracking-wide text-gray-500 uppercase">{label}</div>
				<div class="mt-1 text-2xl"><Amount c={v as number} bold /></div>
			</div>
		{/each}
	</div>

	<div class="mb-3 flex items-center gap-4 text-sm">
		<button onclick={() => (panel = { kind: 'create', parentId: 'asset' })} class="rounded bg-gray-900 px-3 py-1.5 text-white">+ New account</button>
		<button onclick={() => setAll(false)} class="text-gray-600 hover:underline">Expand all</button>
		<button onclick={() => setAll(true)} class="text-gray-600 hover:underline">Collapse all</button>
		<label class="ml-auto flex items-center gap-2 text-gray-600"><input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived</label>
	</div>

	<table class="w-full overflow-hidden rounded-lg border bg-white text-sm">
		<thead class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
			<tr><th class="px-3 py-2">Account</th><th class="px-3 py-2">Description</th><th class="px-3 py-2 text-right">Balance</th><th class="w-48"></th></tr>
		</thead>
		<tbody>
			{#each rows as { acc, depth } (acc.id)}
				{@const group = isGroup(acc)}
				<tr class="group border-t {acc.system === 'root' ? 'bg-gray-50' : ''} {acc.archived ? 'opacity-50' : ''}">
					<td class="px-3 py-1.5" style="padding-left: {0.75 + depth * 1.5}rem">
						{#if group && acc.system !== 'root'}
							<button onclick={() => (collapsed[acc.id] = !collapsed[acc.id])} class="w-4 text-gray-400">{collapsed[acc.id] ? '▸' : '▾'}</button>
						{:else}
							<span class="inline-block w-4"></span>
						{/if}
						<span class={group ? 'font-semibold' : ''}>{acc.name}</span>
						{#if acc.system}<span class="ml-1 rounded bg-gray-200 px-1 text-[10px] text-gray-600">system</span>{/if}
						{#if acc.archived}<span class="ml-1 rounded bg-gray-200 px-1 text-[10px]">archived</span>{/if}
					</td>
					<td class="px-3 py-1.5 text-gray-500">{acc.description}</td>
					<td class="px-3 py-1.5 text-right"><Amount c={balance(acc.id)} bold={group} /></td>
					<td class="px-3 py-1.5 text-right text-xs whitespace-nowrap text-blue-600 opacity-0 group-hover:opacity-100">
						{#if acc.system !== 'opening-balances'}
							<button onclick={() => (panel = { kind: 'create', parentId: acc.id })} class="hover:underline">+ child</button>
							<button onclick={() => (panel = { kind: 'edit', id: acc.id })} class="ml-2 hover:underline">edit</button>
						{/if}
						{#if !acc.system}
							<button onclick={() => (panel = { kind: 'move', id: acc.id })} class="ml-2 hover:underline">move</button>
							<button onclick={() => doArchive(acc.id)} class="ml-2 hover:underline">{acc.archived ? 'unarchive' : 'archive'}</button>
							<button onclick={() => doDelete(acc.id)} class="ml-2 text-red-600 hover:underline">delete</button>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if panel}
	<div class="fixed inset-0 z-40 bg-black/20" onclick={() => (panel = null)} aria-hidden="true"></div>
	<aside class="fixed top-0 right-0 z-50 h-full w-[28rem] overflow-y-auto bg-white p-6 shadow-xl">
		{#if panel.kind === 'move'}
			<MoveForm accountId={panel.id} onclose={() => (panel = null)} />
		{:else if panel.kind === 'edit'}
			<AccountForm mode="edit" accountId={panel.id} onclose={() => (panel = null)} />
		{:else}
			<AccountForm mode="create" parentId={panel.parentId} onclose={() => (panel = null)} />
		{/if}
	</aside>
{/if}
