<script lang="ts">
	// The Accounts page's left pane: Account Type tabs over one Root Account's tree. Group
	// Accounts open and close; the open Account's ancestors start open. Rows drag among their
	// siblings to reorder. Collapsed, it shrinks to a strip of short type labels.
	import { resolve } from '$app/paths';
	import {
		ACCOUNT_TYPE_GUIDE,
		accountTreeRows,
		planDropAccount,
		treeGroupIds,
		type Account
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import Amount from './Amount.svelte';

	let {
		path,
		showArchived = $bindable(false),
		collapsed = $bindable(false)
	}: {
		/** Root Account down to the open Account. */
		path: Account[];
		showArchived?: boolean;
		collapsed?: boolean;
	} = $props();

	const chart = $derived(ledger.chart);
	const root = $derived(path[0]);
	const openId = $derived(path.at(-1)?.id);
	const href = (id: string) => resolve('/accounts/[id]', { id });

	let filter = $state('');
	/** Groups opened or closed by hand; any other group is open when the open Account is in it. */
	let expanded = $state<Record<string, boolean>>({});
	const onPath = $derived(new Set(path.map((p) => p.id)));
	const rows = $derived(
		root
			? accountTreeRows(chart, root.id, {
					showArchived,
					filter,
					isOpen: (id) => expanded[id] ?? onPath.has(id)
				})
			: []
	);
	function setAll(open: boolean) {
		if (root) expanded = Object.fromEntries(treeGroupIds(chart, root.id).map((id) => [id, open]));
	}

	// Drag-and-drop reordering among siblings.
	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let reorderError = $state('');
	const dragged = $derived(dragId ? chart.account(dragId) : undefined);
	const rowIndex = (id: string | null) => rows.findIndex((r) => r.account.id === id);
	async function drop(targetId: string) {
		const id = dragId;
		dragId = overId = null;
		if (!id) return;
		reorderError = '';
		try {
			await ledger.commit(planDropAccount(chart, id, targetId, { now: new Date() }));
		} catch (err) {
			reorderError = `Could not reorder: ${(err as Error).message}`;
		}
	}
</script>

{#snippet panelIcon()}
	<svg
		viewBox="0 0 16 16"
		class="size-4"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		aria-hidden="true"
		><rect x="2" y="2.5" width="12" height="11" rx="2" /><path d="M6 2.5v11" /></svg
	>
{/snippet}

{#if collapsed}
	<nav aria-label="Account Types" class="flex h-full flex-col items-center border-r bg-white py-3">
		<button
			onclick={() => (collapsed = false)}
			class="mb-3 grid size-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900"
			title="Show accounts ( [ )"
			aria-label="Show accounts">{@render panelIcon()}</button
		>
		{#each ACCOUNT_TYPE_GUIDE as g (g.type)}
			{@const active = root?.id === g.type}
			<a
				href={href(g.type)}
				title={g.label}
				aria-current={active ? 'page' : undefined}
				class="-mr-px w-full border-r-2 py-2 text-center text-xs {active
					? 'border-gray-900 font-semibold text-gray-900'
					: 'border-transparent text-gray-400 hover:text-gray-900'}">{g.label.slice(0, 3)}</a
			>
		{/each}
	</nav>
{:else}
	<section class="flex h-full min-h-0 flex-col border-r bg-white">
		<nav aria-label="Account Types" class="flex border-b px-2">
			{#each ACCOUNT_TYPE_GUIDE as g (g.type)}
				{@const active = root?.id === g.type}
				<a
					href={href(g.type)}
					title={g.what}
					aria-current={active ? 'page' : undefined}
					class="-mb-px flex-1 border-b-2 px-1 py-2.5 text-center text-xs {active
						? 'border-gray-900 font-semibold text-gray-900'
						: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}"
					>{g.label}</a
				>
			{/each}
		</nav>

		<div class="border-b p-3">
			<div class="mb-2 flex items-center gap-2 px-1">
				<span class="text-sm font-semibold">{root?.name}</span>
				<span class="ml-auto text-sm"
					><Amount value={root ? chart.balance(root.id) : 0} bold /></span
				>
				<button
					onclick={() => (collapsed = true)}
					class="grid size-7 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-900"
					title="Hide accounts ( [ )"
					aria-label="Hide accounts">{@render panelIcon()}</button
				>
			</div>
			<input
				bind:value={filter}
				type="search"
				placeholder="Filter accounts…"
				aria-label="Filter accounts"
				class="w-full rounded-lg border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
			/>
			<div class="mt-2 flex gap-3 px-1 text-xs text-gray-500">
				<button onclick={() => setAll(true)} class="hover:text-gray-900">Expand all</button>
				<button onclick={() => setAll(false)} class="hover:text-gray-900">Collapse all</button>
			</div>
		</div>

		{#if reorderError}<p class="px-4 pt-2 text-xs text-red-600">{reorderError}</p>{/if}
		<ul class="min-h-0 flex-1 overflow-y-auto py-2" aria-label="{root?.name ?? 'Account'} tree">
			{#each rows as { account: a, depth, expandable, open }, i (a.id)}
				{@const canDrag = !a.system && !filter.trim()}
				{@const canDrop =
					!!dragged && dragged.id !== a.id && !a.system && dragged.parentId === a.parentId}
				<li
					draggable={canDrag}
					ondragstart={(e) => {
						dragId = a.id;
						e.dataTransfer?.setData('text/plain', a.id);
						if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
					}}
					ondragend={() => (dragId = overId = null)}
					ondragover={(e) => {
						if (!canDrop) return;
						e.preventDefault();
						overId = a.id;
					}}
					ondragleave={() => {
						if (overId === a.id) overId = null;
					}}
					ondrop={(e) => {
						e.preventDefault();
						if (canDrop) drop(a.id);
					}}
					class="flex items-center border-l-2 text-sm {a.id === openId
						? 'border-gray-900 bg-gray-100'
						: 'border-transparent hover:bg-gray-50'} {a.archived ? 'opacity-50' : ''} {dragId ===
					a.id
						? 'opacity-40'
						: ''} {overId === a.id
						? rowIndex(dragId) < i
							? 'shadow-[inset_0_-2px_0_var(--color-blue-500)]'
							: 'shadow-[inset_0_2px_0_var(--color-blue-500)]'
						: ''}"
					style="padding-left: {4 + depth * 16}px"
				>
					{#if expandable}
						<button
							onclick={() => (expanded[a.id] = !open)}
							class="grid size-6 shrink-0 place-items-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-900"
							aria-label="{open ? 'Collapse' : 'Expand'} {a.name}"
							aria-expanded={open}
						>
							<svg
								viewBox="0 0 16 16"
								class="size-3 transition-transform {open ? 'rotate-90' : ''}"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								aria-hidden="true"><path d="M6 4l4 4-4 4" /></svg
							>
						</button>
					{:else}
						<span class="size-6 shrink-0"></span>
					{/if}
					<a
						href={href(a.id)}
						draggable="false"
						aria-current={a.id === openId ? 'page' : undefined}
						class="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5 pr-4"
					>
						<span
							class="truncate {chart.isGroup(a.id) ? 'font-medium text-gray-900' : 'text-gray-700'}"
							title={a.name}>{a.name}</span
						>
						<span class="text-xs {chart.isGroup(a.id) ? '' : 'text-gray-500'}"
							><Amount value={chart.balance(a.id)} bold={chart.isGroup(a.id)} /></span
						>
					</a>
				</li>
			{:else}
				<li class="px-4 py-6 text-center text-sm text-gray-500">
					{filter.trim() ? 'No accounts match.' : 'No accounts here yet.'}
				</li>
			{/each}
		</ul>

		<div class="flex items-center justify-between border-t px-4 py-2 text-xs text-gray-500">
			<span>Net Worth <Amount value={chart.totals().netWorth} bold /></span>
			<label class="flex items-center gap-1.5">
				<input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived
			</label>
		</div>
	</section>
{/if}
