<script lang="ts">
	// PROTOTYPE — Variant C: drill-down, one level at a time. Account Types as tabs, breadcrumb,
	// big tappable rows (closest to a future mobile layout). Form replaces the list inline.
	import { TYPES, byId, childrenOf, isGroup, balance, totals, pathOf, countDescendants, doArchive, doDelete } from './data.svelte';
	import Amount from './Amount.svelte';
	import AccountForm from './AccountForm.svelte';
	import MoveForm from './MoveForm.svelte';

	let current = $state('asset');
	let showArchived = $state(false);
	type Inline = { kind: 'create'; parentId: string } | { kind: 'edit'; id: string } | { kind: 'move'; id: string } | null;
	let inline = $state<Inline>(null);

	const t = $derived(totals());
	const acc = $derived(byId(current) ?? byId('asset'));
	const rootType = $derived(acc.type);
	const kids = $derived(childrenOf(acc.id, showArchived));
	const go = (id: string) => {
		current = id;
		inline = null;
	};
</script>

<div class="mx-auto max-w-3xl p-8">
	<div class="mb-6 flex items-baseline justify-between">
		<h1 class="text-2xl font-semibold">Accounts</h1>
		<div class="text-right text-sm text-gray-500">
			Net Worth <span class="ml-1 text-xl text-gray-900"><Amount c={t.netWorth} bold /></span>
			<div class="text-xs">Assets <Amount c={t.assets} /> · Liabilities <Amount c={t.liabilities} /></div>
		</div>
	</div>

	<div class="mb-4 flex gap-1 border-b">
		{#each TYPES as ty (ty.type)}
			<button
				onclick={() => go(ty.type)}
				class="-mb-px border-b-2 px-4 py-2 text-sm {rootType === ty.type ? 'border-gray-900 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-800'}"
				>{ty.label}<span class="ml-2 text-xs text-gray-400"><Amount c={balance(ty.type)} /></span></button
			>
		{/each}
	</div>

	<nav class="mb-4 flex items-center gap-1 text-sm text-gray-500">
		{#each pathOf(acc.id) as p, i (p.id)}
			{#if i > 0}<span>›</span>{/if}
			<button onclick={() => go(p.id)} class="hover:underline {p.id === acc.id ? 'font-semibold text-gray-900' : ''}">{p.name}</button>
		{/each}
	</nav>

	<div class="mb-4 flex items-end justify-between rounded-xl bg-gray-900 p-5 text-white">
		<div>
			<div class="text-sm text-gray-400">{acc.description || (isGroup(acc) ? 'Group Account' : 'Leaf Account')}</div>
			<div class="text-3xl"><Amount c={balance(acc.id)} bold /></div>
		</div>
		<div class="flex gap-3 text-xs text-gray-300">
			{#if acc.system !== 'opening-balances'}
				<button onclick={() => (inline = { kind: 'edit', id: acc.id })} class="hover:text-white">Edit</button>
			{/if}
			{#if !acc.system}
				<button onclick={() => (inline = { kind: 'move', id: acc.id })} class="hover:text-white">Move</button>
				<button onclick={() => doArchive(acc.id)} class="hover:text-white">{acc.archived ? 'Unarchive' : 'Archive'}</button>
				<button onclick={() => doDelete(acc.id) && go(acc.parentId ?? 'asset')} class="text-red-300 hover:text-red-200">Delete</button>
			{/if}
		</div>
	</div>

	{#if inline}
		<div class="rounded-xl border bg-white p-6">
			{#if inline.kind === 'move'}
				<MoveForm accountId={inline.id} onclose={() => (inline = null)} />
			{:else if inline.kind === 'edit'}
				<AccountForm mode="edit" accountId={inline.id} onclose={() => (inline = null)} />
			{:else}
				<AccountForm mode="create" parentId={inline.parentId} onclose={() => (inline = null)} />
			{/if}
		</div>
	{:else}
		<ul class="divide-y rounded-xl border bg-white">
			{#each kids as k (k.id)}
				<li>
					<button onclick={() => go(k.id)} class="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50 {k.archived ? 'opacity-50' : ''}">
						<div>
							<div class="font-medium">{k.name}{#if k.archived}<span class="ml-2 rounded bg-gray-200 px-1 text-[10px]">archived</span>{/if}</div>
							<div class="text-xs text-gray-500">
								{k.description}{#if isGroup(k)}{k.description ? ' · ' : ''}{countDescendants(k.id)} accounts inside{/if}
							</div>
						</div>
						<div class="flex items-center gap-3">
							<Amount c={balance(k.id)} bold={isGroup(k)} />
							<span class="text-gray-300">›</span>
						</div>
					</button>
				</li>
			{:else}
				<li class="px-5 py-8 text-center text-sm text-gray-500">No child accounts. Transactions for this account will list here (next module).</li>
			{/each}
		</ul>
		<div class="mt-3 flex items-center justify-between text-sm">
			{#if acc.system !== 'opening-balances'}
				<button onclick={() => (inline = { kind: 'create', parentId: acc.id })} class="text-blue-600 hover:underline">+ Add account inside {acc.name}</button>
			{/if}
			<label class="flex items-center gap-2 text-gray-600"><input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived</label>
		</div>
	{/if}
</div>
