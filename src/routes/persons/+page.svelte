<script lang="ts">
	// Persons, with none open: where the owner stands with everyone, biggest amounts first.
	import { resolve } from '$app/paths';
	import { formatAmount, netPosition } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const chart = $derived(ledger.chart);
	const rows = $derived(
		ledger.persons
			.filter((p) => !p.archived)
			.map((p) => ({ person: p, ...netPosition(chart, p.id) }))
	);
	const owesYou = $derived(rows.filter((r) => r.net > 0).toSorted((a, b) => b.net - a.net));
	const youOwe = $derived(rows.filter((r) => r.net < 0).toSorted((a, b) => a.net - b.net));
	const total = (list: typeof rows) => list.reduce((s, r) => s + Math.abs(r.net), 0);
</script>

<main class="max-w-4xl space-y-6 page-pad">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading…</p>
	{:else}
		<div>
			<h1 class="text-2xl font-semibold">Persons</h1>
			<p class="mt-1 max-w-2xl text-sm text-gray-600">
				Where you stand with each Person, from the Accounts linked to them. Link a Person by editing
				an Account.
			</p>
		</div>

		{#if rows.length === 0}
			<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
				No Persons yet. Add one from the list, or while recording a Transaction.
			</p>
		{:else}
			<div class="grid gap-x-8 gap-y-5 lg:grid-cols-2">
				{#each [{ title: 'Owe you', list: owesYou, tone: 'text-green-700' }, { title: 'You owe', list: youOwe, tone: 'text-amber-700' }] as group (group.title)}
					<section class="min-w-0">
						<h2 class="mb-1 flex justify-between text-sm font-semibold text-gray-500 uppercase">
							<span>{group.title}</span>
							<span class="tabular-nums {group.tone}">{formatAmount(total(group.list))}</span>
						</h2>
						{#if group.list.length}
							<ul class="divide-y rounded-xl border bg-white">
								{#each group.list as r (r.person.id)}
									<li>
										<a
											href={resolve('/persons/[id]', { id: r.person.id })}
											class="flex items-baseline gap-3 px-4 py-2 text-sm hover:bg-gray-50"
										>
											<span class="flex-1">{r.person.name}</span>
											<span class="tabular-nums {group.tone}">{formatAmount(Math.abs(r.net))}</span>
										</a>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="rounded-xl border bg-white px-4 py-3 text-sm text-gray-500">Nobody.</p>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</main>
