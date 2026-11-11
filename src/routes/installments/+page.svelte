<script lang="ts">
	// Installments, with no plan open: the unpaid rows due by Cut-off across every plan, overdue
	// first, for the next three months (or all of them).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { addDays, dueByCutoff, formatAmount, shortDate, today } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const todayIso = today();
	const LOOK_AHEAD_DAYS = 92;
	let showAll = $state(false);

	const chart = $derived(ledger.chart);
	const groups = $derived(
		dueByCutoff(chart, ledger.installments, {
			today: todayIso,
			until: showAll ? undefined : addDays(todayIso, LOOK_AHEAD_DAYS)
		})
	);
	function record(id: string, due: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/transactions/new')}?installment=${encodeURIComponent(id)}&due=${due}`);
	}
	const peso = (c: number) => formatAmount(c);
</script>

<main class="page-pad">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your plans…</p>
	{:else}
		<div class="mb-4 flex items-baseline justify-between gap-4">
			<h1 class="text-2xl font-semibold">Due by cut-off</h1>
			<label class="flex items-center gap-2 text-sm text-gray-600">
				<input type="checkbox" bind:checked={showAll} class="rounded" /> Show all remaining rows
			</label>
		</div>

		{#if ledger.installments.length === 0}
			<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
				No Installment Plans yet.
				<a class="underline" href={resolve('/installments/new')}>Create one</a>.
			</p>
		{:else if groups.length === 0}
			<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
				Nothing overdue or due in the next 3 months.
			</p>
		{/if}
		<div class="grid gap-x-8 2xl:grid-cols-2">
			{#each groups as g (g.key)}
				<section class="mb-5 min-w-0">
					<h2
						class="mb-1 flex justify-between text-sm font-semibold uppercase {g.key === 'overdue'
							? 'text-amber-700'
							: 'text-gray-500'}"
					>
						<span>{g.key === 'overdue' ? 'Overdue' : `Cut-off ${shortDate(g.key)}`}</span>
						<span class="tabular-nums">{peso(g.total)}</span>
					</h2>
					<ul class="divide-y rounded-xl border bg-white">
						{#each g.items as { plan, status, of } (`${plan.id}:${status.row.due}`)}
							<li class="flex items-center gap-3 px-4 py-2 text-sm">
								<span class="w-28 text-gray-500">{shortDate(status.row.date)}</span>
								<a
									class="flex-1 hover:underline"
									href={resolve('/installments/[id]', { id: plan.id })}
								>
									{plan.title}
									<span class="text-gray-400">#{status.row.n} of {of}</span>
									{#if status.state === 'partly-paid'}<span class="ml-1 text-xs text-sky-700"
											>partly paid</span
										>{/if}
								</a>
								<span class="w-32 text-right tabular-nums">{peso(status.remaining)}</span>
								<button
									class="rounded bg-gray-900 px-2 py-0.5 text-xs text-white"
									onclick={() => record(plan.id, status.row.due)}>Record</button
								>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</main>
