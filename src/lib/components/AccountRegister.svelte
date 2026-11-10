<script lang="ts">
	// One Account's register: newest first, with Out / In in the Account's normal direction and a
	// running Balance on every row. Rows open the Transaction side panel; the Opening Balance row
	// opens the Account's edit form instead.
	import Drawer from './Drawer.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { formatAmount, register, type Transaction } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import Amount from './Amount.svelte';
	import TransactionPanel from './TransactionPanel.svelte';

	let { accountId, onopening }: { accountId: string; onopening: () => void } = $props();

	let openId = $state<string | null>(null);
	const chart = $derived(ledger.chart);
	const rows = $derived(register(chart, accountId));
	const open = $derived(openId ? chart.transaction(openId) : undefined);

	/** An Opening Balance changes from its own Account: here, or on that Account's page. */
	function openOpening(tx: Transaction) {
		const owner = tx.entries.find((e) => e.accountId !== 'opening-balances')?.accountId;
		if (!owner || owner === accountId) onopening();
		else goto(resolve('/accounts/[id]', { id: owner }));
	}
</script>

<section class="mt-8">
	<h2 class="mb-2 text-sm font-semibold text-gray-500 uppercase">Register</h2>
	{#if rows.length === 0}
		<p class="rounded-xl border bg-white px-5 py-8 text-center text-sm text-gray-500">
			No Transactions yet.
		</p>
	{:else}
		<div class="overflow-x-auto rounded-xl border bg-white">
			<table class="w-full text-sm">
				<thead class="text-left text-xs text-gray-500 uppercase">
					<tr>
						<th class="px-4 py-2">Date</th>
						<th class="pr-3">Description</th>
						<th class="pr-3">Other side</th>
						<th class="pr-3 text-right">Out</th>
						<th class="pr-3 text-right">In</th>
						<th class="pr-4 text-right">Balance</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.tx.id)}
						{@const opening = r.tx.origin === 'opening'}
						{@const pending = r.tx.status === 'pending'}
						<tr
							onclick={() => (opening ? openOpening(r.tx) : (openId = r.tx.id))}
							class="cursor-pointer border-t hover:bg-gray-50 {openId === r.tx.id
								? 'bg-sky-50'
								: ''} {pending ? 'text-amber-700 italic' : ''}"
						>
							<td class="px-4 py-2 whitespace-nowrap">{r.tx.date ?? '—'}</td>
							<td class="pr-3">
								{r.tx.description}{#if r.tx.note}<span class="ml-1 text-gray-400" title="Has a Note"
										>✎</span
									>{/if}
								{#each r.tx.tags as tag (tag)}<span class="ml-1 text-xs text-gray-500 not-italic"
										>#{tag}</span
									>{/each}
							</td>
							<td class="pr-3 text-gray-500"
								>{r.counter === 'internal' ? 'Internal transfer' : r.counter.join(', ')}</td
							>
							<td class="pr-3 text-right tabular-nums"
								>{r.change < 0 ? formatAmount(-r.change) : ''}</td
							>
							<td class="pr-3 text-right tabular-nums"
								>{r.change > 0 ? formatAmount(r.change) : ''}</td
							>
							<td class="pr-4 text-right"><Amount value={r.balance} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

{#if open}
	<Drawer id="account-transaction">
		<TransactionPanel tx={open} onclose={() => (openId = null)} ontag={() => {}} />
	</Drawer>
{/if}
