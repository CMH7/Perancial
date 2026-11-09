<script lang="ts" module>
	export const name = 'Days, inline expand';
</script>

<script lang="ts">
	// PROTOTYPE, throwaway. Grouped by day with filter chips; with an Account picked, each day shows
	// its closing Balance instead of a per-row running Balance (sidesteps same-day ordering).
	// Rows expand in place to show the detail; there is no separate detail page.
	import { formatAmount } from '#lib/domain/index.ts';
	import Amount from '#lib/components/Amount.svelte';
	import Detail from './Detail.svelte';
	import { ALL_TAGS, journal, KIND_STYLE, kindOfTx, noFilters, pathOf, register, summary, TARGETS, total, type Filters } from './proto.ts';

	let f = $state(noFilters());
	let expanded = $state<string | null>(null);

	const list = $derived(journal(f));
	const regRows = $derived(f.accountId ? register(f.accountId) : []);
	const changeOf = $derived(new Map(regRows.map((r) => [r.tx.id, r.change])));
	const closing = (date: string) => regRows.filter((r) => (r.tx.date ?? '') <= date).at(-1)?.balance ?? 0;
	const days = $derived.by(() => {
		const out: { date: string; txs: typeof list }[] = [];
		for (const t of list) {
			if (out.at(-1)?.date !== t.date) out.push({ date: t.date!, txs: [] });
			out.at(-1)!.txs.push(t);
		}
		return out;
	});
	const pretty = (d: string) => new Date(d + 'T00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

	type Chip = { key: keyof Filters; label: string };
	const chips = $derived(
		(
			[
				['accountId', f.accountId && pathOf(f.accountId)],
				['kind', f.kind],
				['status', f.status],
				['tag', f.tag && `#${f.tag}`],
				['from', f.from && `from ${f.from}`],
				['to', f.to && `to ${f.to}`]
			] as const
		)
			.filter(([, v]) => v)
			.map(([key, label]) => ({ key, label }) as Chip)
	);
	let adding = $state<'' | 'accountId' | 'kind' | 'status' | 'tag' | 'dates'>('');
</script>

<main class="mx-auto max-w-3xl p-6">
	<input bind:value={f.q} placeholder="Search Description, Note, tags, Accounts…" class="w-full rounded-lg border-gray-300 text-base" />

	<div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
		{#each chips as c (c.key)}
			<span class="flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-white">{c.label}<button onclick={() => (f[c.key] = '')} class="text-gray-400 hover:text-white">✕</button></span>
		{/each}
		<select bind:value={adding} class="rounded-full border-gray-300 py-1 text-sm">
			<option value="">+ filter</option>
			<option value="accountId">Account</option><option value="kind">Kind</option><option value="status">Status</option><option value="tag">Tag</option><option value="dates">Dates</option>
		</select>
		{#if adding === 'accountId'}
			<select bind:value={f.accountId} onchange={() => (adding = '')} class="rounded border-gray-300 py-1 text-sm"><option value="">Choose…</option>{#each TARGETS as t (t.id)}<option value={t.id}>{t.path}</option>{/each}</select>
		{:else if adding === 'kind'}
			{#each ['Expense', 'Income', 'Transfer'] as k (k)}<button class="rounded-full border px-2 py-0.5" onclick={() => ((f.kind = k), (adding = ''))}>{k}</button>{/each}
		{:else if adding === 'status'}
			{#each ['cleared', 'pending'] as s (s)}<button class="rounded-full border px-2 py-0.5" onclick={() => ((f.status = s), (adding = ''))}>{s}</button>{/each}
		{:else if adding === 'tag'}
			{#each ALL_TAGS as t (t)}<button class="rounded-full border px-2 py-0.5" onclick={() => ((f.tag = t), (adding = ''))}>#{t}</button>{/each}
		{:else if adding === 'dates'}
			<input type="date" bind:value={f.from} class="rounded border-gray-300 py-0.5 text-sm" /> – <input type="date" bind:value={f.to} class="rounded border-gray-300 py-0.5 text-sm" />
			<button class="text-sky-700" onclick={() => (adding = '')}>done</button>
		{/if}
	</div>

	{#if f.accountId}
		<p class="mt-4 text-sm text-gray-500">{pathOf(f.accountId)} · Balance today <Amount value={regRows.at(-1)?.balance ?? 0} bold /></p>
	{/if}

	{#each days as day (day.date)}
		<section class="mt-6">
			<header class="flex items-baseline justify-between border-b pb-1 text-xs font-semibold text-gray-500 uppercase">
				<span>{pretty(day.date)}</span>
				{#if f.accountId}<span class="normal-case">closing Balance <Amount value={closing(day.date)} /></span>{/if}
			</header>
			{#each day.txs as t (t.id)}
				{@const k = kindOfTx(t)}
				{@const ch = changeOf.get(t.id)}
				<div class="border-b">
					<button class="flex w-full items-center gap-3 py-2 text-left text-sm" onclick={() => (expanded = expanded === t.id ? null : t.id)}>
						<span class="h-2 w-2 shrink-0 rounded-full {t.status === 'pending' ? 'bg-amber-400' : 'bg-transparent'}" title={t.status}></span>
						<span class="min-w-0 flex-1">
							<span class="block truncate">{t.description}</span>
							<span class="block truncate text-xs text-gray-500">{summary(t)}</span>
						</span>
						{#if k && k !== 'Opening Balance'}<span class="rounded-full px-2 py-0.5 text-xs {KIND_STYLE[k]}">{k}</span>{/if}
						<span class="w-28 text-right tabular-nums">{ch !== undefined ? `${ch < 0 ? '−' : '+'}${formatAmount(Math.abs(ch))}` : formatAmount(total(t))}</span>
					</button>
					{#if expanded === t.id}
						<div class="mb-3 ml-5 rounded-lg bg-gray-50 p-4"><Detail tx={t} compact /></div>
					{/if}
				</div>
			{/each}
		</section>
	{:else}
		<p class="mt-6 text-sm text-gray-500">No Transactions match.</p>
	{/each}
</main>
