<script lang="ts">
	// Scheduled: Upcoming occurrences (overdue first, then the next 30 days) and every plan.
	import { resolve } from '$app/paths';
	import OccurrenceRow from '#lib/components/OccurrenceRow.svelte';
	import {
		describeRule,
		nextOccurrence,
		shortDate,
		today,
		upcoming,
		UPCOMING_DAYS
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let showEnded = $state(false);
	const todayIso = today();
	const chart = $derived(ledger.chart);
	const list = $derived(upcoming(chart, ledger.scheduled, { today: todayIso }));
	const plans = $derived(
		ledger.scheduled
			.map((plan) => ({ plan, next: nextOccurrence(plan, { today: todayIso }) }))
			.filter(({ next }) => showEnded || next)
			.sort(
				(a, b) =>
					(a.next?.date ?? '9999').localeCompare(b.next?.date ?? '9999') ||
					a.plan.versions.at(-1)!.description.localeCompare(b.plan.versions.at(-1)!.description)
			)
	);
	const endedCount = $derived(
		ledger.scheduled.filter((p) => !nextOccurrence(p, { today: todayIso })).length
	);
</script>

<main class="mx-auto max-w-4xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your plans…</p>
	{:else}
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-2xl font-semibold">Scheduled</h1>
			<a href={resolve('/scheduled/new')} class="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
				>New plan</a
			>
		</div>

		<h2 class="mb-2 text-sm font-semibold text-gray-500 uppercase">Upcoming</h2>
		{#if list.length === 0}
			<p class="mb-8 rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
				Nothing overdue or due in the next {UPCOMING_DAYS} days.
			</p>
		{:else}
			<ul class="mb-8 divide-y rounded-xl border bg-white">
				{#each list as view (`${view.plan.id}:${view.occurrence.due}`)}
					<OccurrenceRow {view} />
				{/each}
			</ul>
		{/if}

		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-gray-500 uppercase">Plans</h2>
			{#if endedCount}
				<label class="flex items-center gap-2 text-sm text-gray-600">
					<input type="checkbox" bind:checked={showEnded} class="rounded" /> Show ended ({endedCount})
				</label>
			{/if}
		</div>
		{#if ledger.scheduled.length === 0}
			<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
				No plans yet. A plan marks money you expect to move on a schedule, without touching any
				Balance.
			</p>
		{:else}
			<ul class="divide-y rounded-xl border bg-white text-sm">
				{#each plans as { plan, next } (plan.id)}
					{@const v = plan.versions.at(-1)!}
					<li>
						<a
							href={resolve('/scheduled/[id]', { id: plan.id })}
							class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
						>
							<span class="min-w-0">
								<span class="block truncate font-medium">{v.description}</span>
								<span class="block text-xs text-gray-500">{describeRule(v.rule)}</span>
							</span>
							<span class="text-right text-xs text-gray-500"
								>{next ? `Next ${shortDate(next.date)}` : 'Ended'}</span
							>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</main>
