<script lang="ts">
	// Scheduled, with no plan open: the Occurrences to act on, in two tabs: Upcoming (today and
	// the next 30 days) and Overdue (oldest first). The pane's search and filters apply here too.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import OccurrenceRow from '#lib/components/OccurrenceRow.svelte';
	import { filterUpcoming, today, upcoming, UPCOMING_DAYS } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { scheduledView as view } from './scheduled-view.svelte.ts';

	const todayIso = today();
	type Tab = 'upcoming' | 'overdue';
	const tab = $derived<Tab>(
		page.url.searchParams.get('tab') === 'overdue' ? 'overdue' : 'upcoming'
	);
	function show(next: Tab) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/scheduled')}${next === 'upcoming' ? '' : `?tab=${next}`}`, {
			replace: true
		});
	}

	const chart = $derived(ledger.chart);
	const allUpcoming = $derived(
		upcoming(chart, ledger.scheduled, { today: todayIso, installments: ledger.installments })
	);
	const allOverdue = $derived(allUpcoming.filter((v) => v.status.overdue));
	const allDue = $derived(allUpcoming.filter((v) => !v.status.overdue));
	const list = $derived(filterUpcoming(chart, tab === 'overdue' ? allOverdue : allDue, view.f));
	const listTotal = $derived(tab === 'overdue' ? allOverdue.length : allDue.length);
	const listWhat = $derived(
		tab === 'overdue' ? 'overdue' : `due today or in the next ${UPCOMING_DAYS} days`
	);
</script>

<main class="px-8 py-6">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your plans…</p>
	{:else}
		<h1 class="mb-3 text-2xl font-semibold">Scheduled</h1>

		<div class="mb-4 flex gap-1 border-b text-sm">
			{#each [['upcoming', 'Upcoming', allDue.length], ['overdue', 'Overdue', allOverdue.length]] as const as [key, label, count] (key)}
				<button
					class="-mb-px border-b-2 px-3 py-2 {tab === key
						? 'border-gray-900 font-medium'
						: 'border-transparent text-gray-500 hover:text-gray-900'}"
					onclick={() => show(key)}
					>{label}
					<span
						class="ml-1 rounded-full px-1.5 text-xs {key === 'overdue' && count
							? 'bg-amber-100 text-amber-800'
							: 'bg-gray-100 text-gray-600'}">{count}</span
					></button
				>
			{/each}
		</div>

		{#if ledger.scheduled.length === 0}
			<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
				No plans yet. A plan marks money you expect to move on a schedule, without touching any
				Balance.
				<a class="underline" href={resolve('/scheduled/new')}>Create one</a>.
			</p>
		{:else}
			<p class="mb-3 text-xs text-gray-500">
				{list.length} of {listTotal}
				{listWhat}{#if view.filtering}
					· <button class="text-sky-700 hover:underline" onclick={() => view.clear()}
						>Clear filters</button
					>{/if}
			</p>
			{#if listTotal === 0}
				<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
					Nothing {listWhat}.
				</p>
			{:else if list.length === 0}
				<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
					No Occurrences match.
				</p>
			{:else}
				<ul class="divide-y rounded-xl border bg-white">
					{#each list as occurrence (`${occurrence.plan.id}:${occurrence.occurrence.due}`)}
						<OccurrenceRow view={occurrence} />
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</main>
