<script lang="ts">
	// A SplitPane left pane: Account Type tabs over one Root Account's tree. Group Accounts open and
	// close; the selected Account's ancestors start open. Tabs and rows either link (`link`, the
	// Accounts page) or pick (`onpick`, the Journal's Account filter). With `reorder`, rows drag
	// among their siblings. Collapsed, it shrinks to a strip of short type labels.
	import type { Snippet } from 'svelte';
	import {
		ACCOUNT_TYPE_GUIDE,
		accountTreeRows,
		planDropAccount,
		treeGroupIds
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import Amount from './Amount.svelte';
	import PaneStrip from './PaneStrip.svelte';
	import PaneToggle from './PaneToggle.svelte';

	let {
		rootId,
		selectedId,
		link,
		onpick,
		reorder = false,
		extra,
		showArchived = $bindable(false),
		collapsed = $bindable(false)
	}: {
		/** The Root Account whose tree shows (its tab is the active one). */
		rootId: string;
		/** Highlighted, with its ancestors open; none when nothing is picked. */
		selectedId?: string;
		/** Where a tab or row goes; or else `onpick` is called with its Account ID. */
		link?: (id: string) => string;
		onpick?: (id: string) => void;
		reorder?: boolean;
		/** Drawn under the tabs, above the tree (the Journal's other filters). */
		extra?: Snippet;
		showArchived?: boolean;
		collapsed?: boolean;
	} = $props();

	const chart = $derived(ledger.chart);
	const root = $derived(chart.account(rootId));

	let filter = $state('');
	/** Groups opened or closed by hand; any other group is open when the selection is in it. */
	let expanded = $state<Record<string, boolean>>({});
	const onPath = $derived(new Set(selectedId ? chart.path(selectedId).map((p) => p.id) : []));
	const rows = $derived(
		accountTreeRows(chart, rootId, {
			showArchived,
			filter,
			isOpen: (id) => expanded[id] ?? onPath.has(id)
		})
	);
	function setAll(open: boolean) {
		expanded = Object.fromEntries(treeGroupIds(chart, rootId).map((id) => [id, open]));
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

<!-- A tab or row target: a link, or a button that picks the Account. -->
{#snippet target(id: string, cls: string, title: string, body: Snippet)}
	{#if link}
		<!-- eslint-disable svelte/no-navigation-without-resolve -- `link` returns resolved paths -->
		<a
			href={link(id)}
			{title}
			draggable="false"
			aria-current={id === selectedId ? 'page' : undefined}
			class={cls}>{@render body()}</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}
		<button
			onclick={() => onpick?.(id)}
			{title}
			aria-pressed={id === selectedId}
			class="text-left {cls}">{@render body()}</button
		>
	{/if}
{/snippet}

{#if collapsed}
	<PaneStrip
		bind:collapsed
		label="Accounts"
		tabs={ACCOUNT_TYPE_GUIDE.map((g) => ({
			key: g.type,
			short: g.label.slice(0, 3),
			title: g.label,
			active: rootId === g.type,
			href: link?.(g.type),
			onclick: () => onpick?.(g.type)
		}))}
	/>
{:else}
	<section class="flex h-full min-h-0 flex-col border-r bg-white">
		<nav aria-label="Account Types" class="flex border-b px-2">
			{#each ACCOUNT_TYPE_GUIDE as g (g.type)}
				{#snippet label()}{g.label}{/snippet}
				{@render target(
					g.type,
					`-mb-px flex-1 border-b-2 px-1 py-2.5 text-center text-xs ${
						rootId === g.type
							? 'border-gray-900 font-semibold text-gray-900'
							: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'
					}`,
					g.what,
					label
				)}
			{/each}
		</nav>

		{#if extra}<div class="border-b p-3">{@render extra()}</div>{/if}

		<div class="border-b p-3">
			<div class="mb-2 flex items-center gap-2 px-1">
				<span class="text-sm font-semibold">{root?.name}</span>
				<span class="ml-auto text-sm"><Amount value={chart.balance(rootId)} bold /></span>
				<PaneToggle bind:collapsed label="accounts" />
			</div>
			<input
				bind:value={filter}
				type="search"
				placeholder="Find an Account…"
				aria-label="Find an Account"
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
				{@const group = chart.isGroup(a.id)}
				{@const canDrag = reorder && !a.system && !filter.trim()}
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
					class="flex items-center border-l-2 text-sm {a.id === selectedId
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
					{#snippet row()}
						<span class="truncate {group ? 'font-medium text-gray-900' : 'text-gray-700'}"
							>{a.name}</span
						>
						<span class="text-xs {group ? '' : 'text-gray-500'}"
							><Amount value={chart.balance(a.id)} bold={group} /></span
						>
					{/snippet}
					{@render target(
						a.id,
						'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5 pr-4',
						a.name,
						row
					)}
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
