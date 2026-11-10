<script lang="ts">
	// The Journal: every Transaction, newest first, with filters and search. A row opens the
	// detail side panel.
	import { resolve } from '$app/paths';
	import { KIND } from '#lib/components/kind.ts';
	import TransactionPanel from '#lib/components/TransactionPanel.svelte';
	import {
		ACCOUNT_TYPE_GUIDE,
		formatAmount,
		journal,
		journalRow,
		noFilters,
		type TransactionKind
	} from '#lib/domain/index.ts';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from '#lib/components/AccountPicker.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';

	let f = $state(noFilters());
	let openId = $state<string | null>(null);

	const chart = $derived(ledger.chart);
	const rows = $derived(journal(chart, f));
	const open = $derived(openId ? chart.transaction(openId) : undefined);
	const total = $derived(chart.transactions().filter((t) => t.origin === 'normal').length);
	const tags = $derived([...new Set(chart.transactions().flatMap((t) => t.tags))].sort());
	const accounts = $derived(
		ACCOUNT_TYPE_GUIDE.flatMap((g) =>
			chart
				.all()
				.filter((a) => a.type === g.type && a.system !== 'opening-balances')
				.map((a) => ({
					id: a.id,
					label: chart
						.path(a.id)
						.map((p) => p.name)
						.join(' › ')
				}))
				.sort((a, b) => a.label.localeCompare(b.label))
		)
	);
	const kinds = Object.entries(KIND) as [TransactionKind, (typeof KIND)[TransactionKind]][];
	const filtering = $derived(Object.values(f).some(Boolean));
</script>

<div class="flex">
	<main class="mx-auto w-full max-w-5xl min-w-0 px-4 py-8">
		{#if ledger.error}
			<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
		{:else if !ledger.ready}
			<p class="text-sm text-gray-500">Loading your Transactions…</p>
		{:else}
			<h1 class="mb-4 text-2xl font-semibold">Journal</h1>

			<div class="mb-2 flex flex-wrap gap-2 text-sm">
				<input
					bind:value={f.q}
					placeholder="Search Description, Note, tags, Accounts…"
					aria-label="Search"
					class="w-72 rounded border-gray-300 text-sm"
				/>
				<input
					type="date"
					bind:value={f.from}
					aria-label="From date"
					class="rounded border-gray-300 text-sm"
				/>
				<input
					type="date"
					bind:value={f.to}
					aria-label="To date"
					class="rounded border-gray-300 text-sm"
				/>
				<AccountPicker
					bind:value={f.accountId}
					items={accountItems.for(accounts.map((a) => a.id))}
					emptyLabel="Any Account"
					class="w-56"
				/>
				<select bind:value={f.kind} aria-label="Kind" class="rounded border-gray-300 text-sm">
					<option value="">Any kind</option>
					{#each kinds as [key, k] (key)}<option value={key}>{k.label}</option>{/each}
				</select>
				<select bind:value={f.status} aria-label="Status" class="rounded border-gray-300 text-sm">
					<option value="">Any status</option>
					<option value="cleared">Cleared</option>
					<option value="pending">Pending</option>
				</select>
				<select bind:value={f.tag} aria-label="Tag" class="rounded border-gray-300 text-sm">
					<option value="">Any tag</option>
					{#each tags as tag (tag)}<option value={tag}>#{tag}</option>{/each}
				</select>
				{#if filtering}
					<button class="text-sky-700 hover:underline" onclick={() => (f = noFilters())}
						>Clear</button
					>
				{/if}
			</div>
			<p class="mb-3 text-xs text-gray-500">{rows.length} of {total} Transactions</p>

			{#if total === 0}
				<p class="text-sm text-gray-500">
					No Transactions yet. <a class="text-sky-700 underline" href={resolve('/transactions/new')}
						>Record one</a
					>.
				</p>
			{:else}
				<table class="w-full text-sm">
					<thead class="text-left text-xs text-gray-500 uppercase">
						<tr>
							<th class="py-2 pr-3">Date</th>
							<th class="pr-3">Description</th>
							<th class="pr-3">From → To</th>
							<th class="pr-3">Kind</th>
							<th class="text-right">Amount</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as tx (tx.id)}
							{@const row = journalRow(chart, tx)}
							<tr
								onclick={() => (openId = tx.id)}
								class="cursor-pointer border-t hover:bg-gray-50 {openId === tx.id
									? 'bg-sky-50'
									: ''} {row.pending ? 'text-amber-700 italic' : ''}"
							>
								<td class="py-2 pr-3 whitespace-nowrap">{tx.date}</td>
								<td class="pr-3">
									<button class="text-left hover:underline" onclick={() => (openId = tx.id)}
										>{tx.description}</button
									>
									{#each tx.tags as tag (tag)}
										<button
											class="ml-1 text-xs text-gray-500 not-italic hover:text-sky-700"
											onclick={(e) => {
												e.stopPropagation();
												f.tag = tag;
											}}>#{tag}</button
										>
									{/each}
								</td>
								<td class="pr-3 text-gray-500">{row.from.join(' + ')} → {row.to.join(' + ')}</td>
								<td class="pr-3">
									<span class="rounded-full px-2 py-0.5 text-xs not-italic {KIND[row.kind].style}"
										>{KIND[row.kind].label}</span
									>
								</td>
								<td class="text-right tabular-nums">{formatAmount(row.total)}</td>
							</tr>
						{:else}
							<tr><td colspan="5" class="py-4 text-gray-500">No Transactions match.</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		{/if}
	</main>

	{#if open}
		<div
			class="sticky top-0 h-screen w-96 shrink-0 overflow-y-auto border-l bg-white p-6 shadow-xl"
		>
			<TransactionPanel tx={open} onclose={() => (openId = null)} ontag={(tag) => (f.tag = tag)} />
		</div>
	{/if}
</div>
