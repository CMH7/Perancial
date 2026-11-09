<script lang="ts" module>
	export const name = 'Separate screens';
</script>

<script lang="ts">
	// PROTOTYPE, throwaway. Register and Journal are separate screens; a row opens a full detail page.
	import { formatAmount } from '#lib/domain/index.ts';
	import Amount from '#lib/components/Amount.svelte';
	import Detail from './Detail.svelte';
	import { ALL_TAGS, journal, KIND_STYLE, kindOfTx, noFilters, pathOf, register, summary, TARGETS, total, TXS, type Tx } from './proto.ts';

	let screen = $state<'register' | 'journal'>('register');
	let accountId = $state('bpi');
	let f = $state(noFilters());
	let open = $state<Tx | null>(null);

	// Register shows newest first; running Balance computed oldest first.
	const rows = $derived(register(accountId).toReversed());
	const list = $derived(journal(f));
</script>

<main class="mx-auto max-w-5xl p-6">
	{#if open}
		<button class="mb-4 text-sm text-sky-700 hover:underline" onclick={() => (open = null)}>← Back to {screen === 'register' ? pathOf(accountId) : 'Journal'}</button>
		<div class="max-w-xl rounded-xl border bg-white p-6"><Detail tx={open} /></div>
	{:else}
		<nav class="mb-6 flex gap-4 border-b text-sm">
			{#each [['register', 'Account register'], ['journal', 'Journal']] as [key, label] (key)}
				<button class="-mb-px border-b-2 px-1 pb-2 {screen === key ? 'border-gray-900 font-semibold' : 'border-transparent text-gray-500'}" onclick={() => (screen = key as typeof screen)}>{label}</button>
			{/each}
		</nav>

		{#if screen === 'register'}
			<div class="mb-4 flex items-baseline justify-between">
				<select bind:value={accountId} class="rounded border-gray-300 text-sm">
					{#each TARGETS as t (t.id)}<option value={t.id}>{t.group ? '▸ ' : ''}{t.path}</option>{/each}
				</select>
				<p class="text-sm text-gray-500">Balance <span class="text-xl text-gray-900"><Amount value={rows[0]?.balance ?? 0} bold /></span></p>
			</div>
			<table class="w-full text-sm">
				<thead class="text-left text-xs text-gray-500 uppercase">
					<tr><th class="py-2">Date</th><th>Description</th><th>Other side</th><th class="text-right">Out</th><th class="text-right">In</th><th class="text-right">Balance</th></tr>
				</thead>
				<tbody>
					{#each rows as r (r.tx.id)}
						<tr class="cursor-pointer border-t hover:bg-gray-50 {r.tx.status === 'pending' ? 'text-gray-500 italic' : ''}" onclick={() => (open = r.tx)}>
							<td class="py-2 whitespace-nowrap">{r.tx.date ?? '—'}</td>
							<td>{r.tx.description}{#if r.tx.note}<span class="ml-1 text-gray-400" title="Has a Note">✎</span>{/if}</td>
							<td class="text-gray-500">{r.counter}</td>
							<td class="text-right tabular-nums">{r.change < 0 ? formatAmount(-r.change) : ''}</td>
							<td class="text-right tabular-nums">{r.change > 0 ? formatAmount(r.change) : ''}</td>
							<td class="text-right"><Amount value={r.balance} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="mt-2 text-xs text-gray-500">Out / In are in this Account's normal direction (for a credit card, In = more owed). Italic = pending.</p>
		{:else}
			<div class="mb-4 flex flex-wrap gap-2 text-sm">
				<input bind:value={f.q} placeholder="Search Description, Note, tags…" class="w-64 rounded border-gray-300 text-sm" />
				<input type="date" bind:value={f.from} class="rounded border-gray-300 text-sm" />
				<input type="date" bind:value={f.to} class="rounded border-gray-300 text-sm" />
				<select bind:value={f.accountId} class="rounded border-gray-300 text-sm"><option value="">Any Account</option>{#each TARGETS as t (t.id)}<option value={t.id}>{t.path}</option>{/each}</select>
				<select bind:value={f.kind} class="rounded border-gray-300 text-sm"><option value="">Any kind</option>{#each ['Expense', 'Income', 'Transfer'] as k (k)}<option>{k}</option>{/each}</select>
				<select bind:value={f.status} class="rounded border-gray-300 text-sm"><option value="">Any status</option><option>cleared</option><option>pending</option></select>
				<select bind:value={f.tag} class="rounded border-gray-300 text-sm"><option value="">Any tag</option>{#each ALL_TAGS as t (t)}<option>{t}</option>{/each}</select>
				<button class="text-sky-700 hover:underline" onclick={() => (f = noFilters())}>Clear</button>
			</div>
			<p class="mb-2 text-xs text-gray-500">{list.length} of {TXS.filter((t) => t.date).length} Transactions</p>
			<table class="w-full text-sm">
				<thead class="text-left text-xs text-gray-500 uppercase">
					<tr><th class="py-2">Date</th><th>Description</th><th>From → To</th><th>Kind</th><th class="text-right">Amount</th></tr>
				</thead>
				<tbody>
					{#each list as t (t.id)}
						{@const k = kindOfTx(t)}
						<tr class="cursor-pointer border-t hover:bg-gray-50 {t.status === 'pending' ? 'text-gray-500 italic' : ''}" onclick={() => (open = t)}>
							<td class="py-2 whitespace-nowrap">{t.date}</td>
							<td>{t.description}{#each t.tags as tag (tag)}<span class="ml-1 text-xs text-gray-400">#{tag}</span>{/each}</td>
							<td class="text-gray-500">{summary(t)}</td>
							<td>{#if k && k !== 'Opening Balance'}<span class="rounded-full px-2 py-0.5 text-xs not-italic {KIND_STYLE[k]}">{k}</span>{/if}</td>
							<td class="text-right tabular-nums">{formatAmount(total(t))}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</main>
