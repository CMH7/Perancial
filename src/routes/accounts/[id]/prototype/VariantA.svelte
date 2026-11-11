<script lang="ts">
	// PROTOTYPE ONLY. Variant A, "Split": left column = vertical Account Type tabs with the open
	// type's tree under it (names only, no totals); right column = the open Account.
	import { ACCOUNT_TYPE_GUIDE, clearedBalance, type Account } from '#lib/domain/index.ts';
	import AccountRegister from '#lib/components/AccountRegister.svelte';
	import Amount from '#lib/components/Amount.svelte';
	import { TYPE_TONE, type VariantProps } from './types.ts';

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

	const totals = $derived(chart.totals());
	/** Branches the user opened by hand; the open Account's ancestors are always open. */
	let expanded = $state<Record<string, boolean>>({});
	const onPath = $derived(new Set(path.map((p) => p.id)));
	const isOpen = (a: Account) => expanded[a.id] ?? onPath.has(a.id);
</script>

{#snippet tree(parentId: string, depth: number)}
	{#each chart.children(parentId, { showArchived }) as a (a.id)}
		{@const kids = chart.isGroup(a.id)}
		<li>
			<div
				class="flex items-center rounded-md {a.id === account.id
					? 'bg-gray-900 text-white'
					: 'text-gray-700 hover:bg-gray-100'} {a.archived ? 'opacity-50' : ''}"
				style="padding-left: {depth * 14}px"
			>
				<button
					class="w-6 shrink-0 text-center text-xs {kids ? '' : 'invisible'}"
					onclick={() => (expanded[a.id] = !isOpen(a))}
					aria-label={isOpen(a) ? 'Collapse' : 'Expand'}>{isOpen(a) ? '▾' : '▸'}</button
				>
				<a href={href(a.id)} class="min-w-0 flex-1 truncate py-1.5 pr-2 text-sm" title={a.name}
					>{a.name}</a
				>
			</div>
			{#if kids && isOpen(a)}
				<ul>{@render tree(a.id, depth + 1)}</ul>
			{/if}
		</li>
	{/each}
{/snippet}

<div class="grid min-h-[calc(100vh-var(--nav-h))] grid-cols-[18rem_minmax(0,1fr)] bg-gray-50">
	<aside
		class="sticky top-(--nav-h) h-[calc(100vh-var(--nav-h))] overflow-y-auto border-r bg-white px-3 py-5"
	>
		<div class="mb-5 rounded-xl bg-gray-900 px-4 py-3 text-white">
			<div class="text-xs text-gray-400">Net Worth</div>
			<div class="text-xl"><Amount value={totals.netWorth} bold /></div>
		</div>

		<nav aria-label="Account Types" class="space-y-1">
			{#each ACCOUNT_TYPE_GUIDE as g (g.type)}
				{@const active = root?.id === g.type}
				<div>
					<a
						href={href(g.type)}
						title={g.what}
						aria-current={active ? 'page' : undefined}
						class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm {active
							? 'bg-gray-100 font-semibold text-gray-900'
							: 'text-gray-600 hover:bg-gray-50'}"
					>
						<span class="size-2 rounded-full {TYPE_TONE[g.type].dot}"></span>
						{g.label}
					</a>
					{#if active}
						<ul class="mt-1 mb-3 ml-3 border-l pl-1">{@render tree(g.type, 0)}</ul>
					{/if}
				</div>
			{/each}
		</nav>

		<label class="mt-6 flex items-center gap-2 px-3 text-xs text-gray-500">
			<input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived
		</label>
	</aside>

	<main class="min-w-0 px-8 py-6">
		<nav class="mb-3 flex flex-wrap items-center gap-1 text-sm text-gray-500" aria-label="Path">
			{#each path as p, i (p.id)}
				{#if i > 0}<span aria-hidden="true">›</span>{/if}
				<a href={href(p.id)} class="hover:underline {p.id === account.id ? 'text-gray-900' : ''}"
					>{p.name}</a
				>
			{/each}
		</nav>

		<header class="mb-6 flex flex-wrap items-end justify-between gap-4">
			<div>
				<h1 class="text-3xl font-semibold tracking-tight">{account.name}</h1>
				<p class="mt-1 text-sm text-gray-500">
					{account.description || (group ? 'Group Account' : 'Leaf Account')}
				</p>
			</div>
			<div class="text-right">
				<div class="text-3xl"><Amount value={chart.balance(account.id)} bold /></div>
				{#if account.type === 'asset' || account.type === 'liability'}
					<div class="text-xs text-gray-500">
						Cleared <Amount value={clearedBalance(chart, account.id)} />
					</div>
				{/if}
			</div>
		</header>

		<div class="mb-6 flex flex-wrap gap-2 text-sm">
			{#if account.system !== 'opening-balances'}
				<button
					onclick={() => open('create')}
					class="rounded-lg bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700">+ Add account</button
				>
				<button onclick={() => open('edit')} class="rounded-lg border bg-white px-3 py-1.5"
					>Edit</button
				>
			{/if}
			{#if !account.system}
				<button onclick={() => open('move')} class="rounded-lg border bg-white px-3 py-1.5"
					>Move</button
				>
				<button onclick={() => open('archive')} class="rounded-lg border bg-white px-3 py-1.5"
					>{account.archived ? 'Unarchive' : 'Archive'}</button
				>
				<button
					onclick={() => open('delete')}
					class="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-red-600">Delete</button
				>
			{/if}
		</div>

		{#if children.length}
			<section class="mb-2">
				<h2 class="mb-2 text-sm font-semibold text-gray-500 uppercase">Inside</h2>
				<ul class="divide-y rounded-xl border bg-white">
					{#each children as c (c.id)}
						<li>
							<a
								href={href(c.id)}
								class="flex items-center justify-between gap-4 px-5 py-3 hover:bg-gray-50"
							>
								<div class="min-w-0">
									<div class="truncate font-medium">{c.name}</div>
									{#if c.description}<div class="truncate text-xs text-gray-500">
											{c.description}
										</div>{/if}
								</div>
								<Amount value={chart.balance(c.id)} bold={chart.isGroup(c.id)} />
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<AccountRegister accountId={account.id} onopening={() => open('edit')} />
	</main>
</div>
