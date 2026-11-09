<script lang="ts" module>
	export const name = 'One list, sidebar, drawer';
</script>

<script lang="ts">
	// PROTOTYPE, throwaway. One list: the Journal, which becomes a register (running Balance column)
	// when an Account is picked in the sidebar. Detail slides in as a drawer on the right.
	import { formatAmount } from '#lib/domain/index.ts';
	import Amount from '#lib/components/Amount.svelte';
	import Detail from './Detail.svelte';
	import { ALL_TAGS, journal, noFilters, register, summary, TARGETS, total, type Tx } from './proto.ts';

	let f = $state(noFilters());
	let open = $state<Tx | null>(null);

	const list = $derived(journal(f));
	// Running Balance per Transaction for the picked Account (computed over all history, unfiltered).
	const balances = $derived(f.accountId ? new Map(register(f.accountId).map((r) => [r.tx.id, r])) : null);
	const depth = (path: string) => path.split(' › ').length - 1;
</script>

<div class="flex h-[calc(100vh-3.5rem)]">
	<aside class="w-64 shrink-0 overflow-y-auto border-r bg-gray-50 p-4 text-sm">
		<input bind:value={f.q} placeholder="Search…" class="mb-4 w-full rounded border-gray-300 text-sm" />
		<p class="mb-1 text-xs font-semibold text-gray-500 uppercase">Account</p>
		<button class="block w-full rounded px-2 py-0.5 text-left {f.accountId === '' ? 'bg-gray-900 text-white' : 'hover:bg-gray-200'}" onclick={() => (f.accountId = '')}>All (Journal)</button>
		{#each TARGETS as t (t.id)}
			<button
				class="block w-full truncate rounded py-0.5 pr-2 text-left {f.accountId === t.id ? 'bg-gray-900 text-white' : 'hover:bg-gray-200'} {t.group ? 'font-medium' : ''}"
				style="padding-left: {0.5 + depth(t.path) * 0.75}rem"
				onclick={() => (f.accountId = t.id)}>{t.path.split(' › ').at(-1)}</button
			>
		{/each}
		<p class="mt-4 mb-1 text-xs font-semibold text-gray-500 uppercase">Kind</p>
		{#each ['', 'Expense', 'Income', 'Transfer'] as k (k)}
			<label class="mr-2 inline-flex items-center gap-1"><input type="radio" bind:group={f.kind} value={k} />{k || 'Any'}</label>
		{/each}
		<p class="mt-4 mb-1 text-xs font-semibold text-gray-500 uppercase">Status</p>
		{#each ['', 'cleared', 'pending'] as s (s)}
			<label class="mr-2 inline-flex items-center gap-1"><input type="radio" bind:group={f.status} value={s} />{s || 'Any'}</label>
		{/each}
		<p class="mt-4 mb-1 text-xs font-semibold text-gray-500 uppercase">Tag</p>
		{#each ['', ...ALL_TAGS] as t (t)}
			<label class="mr-2 inline-flex items-center gap-1"><input type="radio" bind:group={f.tag} value={t} />{t ? `#${t}` : 'Any'}</label>
		{/each}
		<p class="mt-4 mb-1 text-xs font-semibold text-gray-500 uppercase">Dates</p>
		<input type="date" bind:value={f.from} class="mb-1 w-full rounded border-gray-300 text-sm" />
		<input type="date" bind:value={f.to} class="w-full rounded border-gray-300 text-sm" />
	</aside>

	<main class="flex-1 overflow-y-auto p-6">
		<div class="mb-4 flex items-baseline justify-between">
			<h1 class="text-xl font-semibold">{f.accountId ? TARGETS.find((t) => t.id === f.accountId)?.path : 'Journal'}</h1>
			{#if balances}
				<p class="text-sm text-gray-500">Balance today <Amount value={[...balances.values()].at(-1)?.balance ?? 0} bold /></p>
			{/if}
		</div>
		<ul class="divide-y rounded-lg border bg-white">
			{#each list as t (t.id)}
				{@const r = balances?.get(t.id)}
				<li>
					<button class="flex w-full items-center gap-4 px-4 py-2 text-left text-sm hover:bg-gray-50 {open?.id === t.id ? 'bg-sky-50' : ''}" onclick={() => (open = t)}>
						<span class="w-20 shrink-0 text-xs text-gray-500">{t.date}</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate">{t.description}{#if t.status === 'pending'}<span class="ml-2 rounded bg-amber-100 px-1 text-xs text-amber-800">pending</span>{/if}</span>
							<span class="block truncate text-xs text-gray-500">{summary(t)}</span>
						</span>
						{#if r}
							<span class="w-28 text-right tabular-nums {r.change < 0 ? 'text-rose-700' : 'text-emerald-700'}">{r.change < 0 ? '−' : '+'}{formatAmount(Math.abs(r.change))}</span>
							<span class="w-28 text-right"><Amount value={r.balance} /></span>
						{:else}
							<span class="w-28 text-right tabular-nums">{formatAmount(total(t))}</span>
						{/if}
					</button>
				</li>
			{:else}
				<li class="p-4 text-sm text-gray-500">No Transactions match.</li>
			{/each}
		</ul>
	</main>

	{#if open}
		<aside class="w-96 shrink-0 overflow-y-auto border-l bg-white p-6 shadow-xl">
			<button class="float-right text-gray-400 hover:text-gray-900" onclick={() => (open = null)}>✕</button>
			<Detail tx={open} />
		</aside>
	{/if}
</div>
