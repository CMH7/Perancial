<script lang="ts">
	// PROTOTYPE ONLY. Variant C, "Explorer": three panes filling the window, each scrolling on
	// its own. Collapsible tree pane (Account Type tabs on top, tree under), balances in a
	// fixed column with names truncating | the open Account's detail and register.
	import { ACCOUNT_TYPE_GUIDE, clearedBalance } from '#lib/domain/index.ts';
	import AccountRegister from '#lib/components/AccountRegister.svelte';
	import Amount from '#lib/components/Amount.svelte';
	import type { VariantProps } from './types.ts';

	let {
		chart,
		account,
		path,
		root,
		children,
		group,
		showArchived = $bindable(),
		href,
		open
	}: VariantProps = $props();

	let filter = $state('');
	/** Tree pane hidden to give the detail the width; `[` toggles it. */
	let collapsed = $state(false);
	const totals = $derived(chart.totals());
	const needle = $derived(filter.trim().toLowerCase());
	/** True when the Account or something inside it matches the filter. */
	const matches = (id: string): boolean =>
		!needle ||
		(chart.account(id)?.name.toLowerCase().includes(needle) ?? false) ||
		chart.children(id, { showArchived }).some((c) => matches(c.id));

	/** Groups opened or closed by hand; otherwise a group is open when the open Account is in it. */
	let expanded = $state<Record<string, boolean>>({});
	const onPath = $derived(new Set(path.map((p) => p.id)));
	const isOpen = (id: string) => !!needle || (expanded[id] ?? onPath.has(id));
	function setAll(value: boolean) {
		if (!root) return;
		expanded = Object.fromEntries(
			chart
				.subtree(root.id)
				.filter((a) => chart.isGroup(a.id))
				.map((a) => [a.id, value])
		);
	}
</script>

{#snippet tree(parentId: string, depth: number)}
	{#each chart.children(parentId, { showArchived }).filter((a) => matches(a.id)) as a (a.id)}
		{@const kids = chart.isGroup(a.id)}
		{@const opened = kids && isOpen(a.id)}
		<div
			class="flex items-center border-l-2 text-sm {a.id === account.id
				? 'border-gray-900 bg-gray-100'
				: 'border-transparent hover:bg-gray-50'} {a.archived ? 'opacity-50' : ''}"
			style="padding-left: {4 + depth * 16}px"
		>
			{#if kids}
				<button
					onclick={() => (expanded[a.id] = !opened)}
					class="grid size-6 shrink-0 place-items-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-900"
					aria-label="{opened ? 'Collapse' : 'Expand'} {a.name}"
					aria-expanded={opened}
				>
					<svg
						viewBox="0 0 16 16"
						class="size-3 transition-transform {opened ? 'rotate-90' : ''}"
						fill="none"
						stroke="currentColor"
						stroke-width="2"><path d="M6 4l4 4-4 4" /></svg
					>
				</button>
			{:else}
				<span class="size-6 shrink-0"></span>
			{/if}
			<a
				href={href(a.id)}
				class="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1.5 pr-4"
			>
				<span class="truncate {kids ? 'font-medium text-gray-900' : 'text-gray-700'}" title={a.name}
					>{a.name}</span
				>
				<span class="text-xs {kids ? '' : 'text-gray-500'}"
					><Amount value={chart.balance(a.id)} bold={kids} /></span
				>
			</a>
		</div>
		{#if opened}{@render tree(a.id, depth + 1)}{/if}
	{/each}
{/snippet}

<svelte:window
	onkeydown={(e) => {
		const t = e.target as HTMLElement | null;
		if (t?.closest('input, textarea, select, [contenteditable]')) return;
		if (e.key === '[') collapsed = !collapsed;
	}}
/>

{#snippet panelIcon()}
	<svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5"
		><rect x="2" y="2.5" width="12" height="11" rx="2" /><path d="M6 2.5v11" /></svg
	>
{/snippet}

<div
	class="grid h-[calc(100vh-var(--nav-h))] overflow-hidden transition-[grid-template-columns] duration-200"
	style="grid-template-columns: {collapsed ? '3rem' : '24rem'} minmax(0, 1fr)"
>
	{#if collapsed}
		<!-- Collapsed strip -->
		<nav aria-label="Account Types" class="flex flex-col items-center border-r bg-white py-3">
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
					class="-mr-px w-full border-r-2 py-2 text-center text-xs {active
						? 'border-gray-900 font-semibold text-gray-900'
						: 'border-transparent text-gray-400 hover:text-gray-900'}">{g.label.slice(0, 3)}</a
				>
			{/each}
		</nav>
	{:else}
		<!-- Tree -->
		<section class="flex min-h-0 flex-col border-r bg-white">
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
				<div class="mb-2 flex items-center justify-between gap-2 px-1">
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
					placeholder="Filter accounts…"
					class="w-full rounded-lg border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
				/>
				<div class="mt-2 flex gap-3 px-1 text-xs text-gray-500">
					<button onclick={() => setAll(true)} class="hover:text-gray-900">Expand all</button>
					<button onclick={() => setAll(false)} class="hover:text-gray-900">Collapse all</button>
				</div>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto py-2">
				{#if root}{@render tree(root.id, 0)}{/if}
			</div>
			<div class="flex items-center justify-between border-t px-4 py-2 text-xs text-gray-500">
				<span>Net Worth <Amount value={totals.netWorth} bold /></span>
				<label class="flex items-center gap-1.5">
					<input type="checkbox" bind:checked={showArchived} class="rounded" /> Archived
				</label>
			</div>
		</section>
	{/if}

	<!-- Detail -->
	<main class="min-h-0 overflow-y-auto bg-gray-50 px-10 py-8">
		<div class="mb-2 flex flex-wrap items-center gap-1 text-xs text-gray-500">
			{#each path as p, i (p.id)}
				{#if i > 0}<span>›</span>{/if}
				<a href={href(p.id)} class="hover:underline">{p.name}</a>
			{/each}
		</div>
		<div class="flex flex-wrap items-start justify-between gap-6">
			<div>
				<h1 class="text-3xl font-semibold tracking-tight">{account.name}</h1>
				<p class="mt-1 text-sm text-gray-500">
					{account.description || (group ? 'Group Account' : 'Leaf Account')}
					{#if account.archived}<span class="ml-1 rounded bg-gray-200 px-1 text-xs">archived</span
						>{/if}
				</p>
			</div>
			<dl class="flex gap-8 text-right">
				<div>
					<dt class="text-xs text-gray-500">Balance</dt>
					<dd class="text-2xl"><Amount value={chart.balance(account.id)} bold /></dd>
				</div>
				{#if account.type === 'asset' || account.type === 'liability'}
					<div>
						<dt class="text-xs text-gray-500">Cleared</dt>
						<dd class="text-2xl text-gray-500">
							<Amount value={clearedBalance(chart, account.id)} />
						</dd>
					</div>
				{/if}
				{#if group}
					<div>
						<dt class="text-xs text-gray-500">Inside</dt>
						<dd class="text-2xl">{chart.descendantCount(account.id)}</dd>
					</div>
				{/if}
			</dl>
		</div>

		<div class="mt-5 flex flex-wrap gap-1 border-b pb-4 text-sm">
			{#if account.system !== 'opening-balances'}
				<button
					onclick={() => open('create')}
					class="mr-2 rounded-md bg-gray-900 px-3 py-1.5 text-white">+ Add account inside</button
				>
				<button onclick={() => open('edit')} class="rounded-md px-3 py-1.5 hover:bg-gray-200"
					>Edit</button
				>
			{/if}
			{#if !account.system}
				<button onclick={() => open('move')} class="rounded-md px-3 py-1.5 hover:bg-gray-200"
					>Move</button
				>
				<button onclick={() => open('archive')} class="rounded-md px-3 py-1.5 hover:bg-gray-200"
					>{account.archived ? 'Unarchive' : 'Archive'}</button
				>
				<button
					onclick={() => open('delete')}
					class="rounded-md px-3 py-1.5 text-red-600 hover:bg-red-50">Delete</button
				>
			{/if}
		</div>

		{#if children.length}
			<div class="mt-4 flex flex-wrap gap-2">
				{#each children as c (c.id)}
					<a
						href={href(c.id)}
						class="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm ring-1 ring-gray-200 hover:ring-gray-400"
						>{c.name}<span class="text-xs text-gray-500"
							><Amount value={chart.balance(c.id)} /></span
						></a
					>
				{/each}
			</div>
		{/if}

		<AccountRegister accountId={account.id} onopening={() => open('edit')} />
	</main>
</div>
