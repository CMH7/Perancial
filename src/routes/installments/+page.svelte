<script lang="ts">
	// Installments: the Plans list, and the rows due by Cut-off across every plan.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		addDays,
		dueByCutoff,
		formatAmount,
		plansList,
		shortDate,
		today
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const todayIso = today();
	const LOOK_AHEAD_DAYS = 92;
	const tab = $derived(page.url.searchParams.get('tab') === 'due' ? 'due' : 'plans');
	let showAll = $state(false);

	const chart = $derived(ledger.chart);
	const lines = $derived(plansList(chart, ledger.installments, { today: todayIso }));
	const left = $derived(lines.reduce((s, l) => s + l.summary.balance, 0));
	const groups = $derived(
		dueByCutoff(chart, ledger.installments, {
			today: todayIso,
			until: showAll ? undefined : addDays(todayIso, LOOK_AHEAD_DAYS)
		})
	);
	const accountName = (id: string) =>
		chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ') || '(deleted Account)';

	function show(next: 'plans' | 'due') {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/installments')}${next === 'due' ? '?tab=due' : ''}`, { replaceState: true });
	}
	function record(id: string, due: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/transactions/new')}?installment=${encodeURIComponent(id)}&due=${due}`);
	}
	const peso = (c: number) => formatAmount(c);
</script>

<main class="mx-auto max-w-5xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your plans…</p>
	{:else}
		<div class="mb-4 flex items-end justify-between">
			<div>
				<h1 class="text-2xl font-semibold">Installments</h1>
				<p class="text-sm text-gray-500">
					{peso(left)} left across {lines.filter((l) => l.summary.next).length} open plans
				</p>
			</div>
			<a
				href={resolve('/installments/new')}
				class="rounded bg-gray-900 px-3 py-1.5 text-sm text-white">New plan</a
			>
		</div>

		<div class="mb-4 flex gap-1 border-b text-sm">
			{#each [['plans', 'Plans'], ['due', 'Due by cut-off']] as const as [key, label] (key)}
				<button
					class="-mb-px border-b-2 px-3 py-2 {tab === key
						? 'border-gray-900 font-medium'
						: 'border-transparent text-gray-500 hover:text-gray-900'}"
					onclick={() => show(key)}>{label}</button
				>
			{/each}
		</div>

		{#if lines.length === 0}
			<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
				No Installment Plans yet.
				<a class="underline" href={resolve('/installments/new')}>Create one</a>.
			</p>
		{:else if tab === 'plans'}
			<ul class="divide-y rounded-xl border bg-white">
				{#each lines as { plan, summary: s, overdue } (plan.id)}
					<li>
						<a
							href={resolve('/installments/[id]', { id: plan.id })}
							class="grid grid-cols-[1fr_10rem_9rem_9rem] items-center gap-4 px-5 py-3 hover:bg-gray-50"
						>
							<div class="min-w-0">
								<div class="font-medium">
									{plan.title}
									{#if plan.kind === 'internal'}<span
											class="ml-1 rounded bg-violet-100 px-1.5 text-xs text-violet-700"
											>Internal</span
										>{/if}
								</div>
								<div class="truncate text-xs text-gray-500">
									{accountName(plan.accounts.repaid)}
								</div>
							</div>
							<div>
								<div class="h-1.5 rounded bg-gray-100">
									<div
										class="h-1.5 rounded bg-green-500"
										style="width: {(100 * s.doneRows) / s.rowCount}%"
									></div>
								</div>
								<div class="mt-1 text-xs text-gray-500">{s.doneRows} of {s.rowCount} paid</div>
							</div>
							<div class="text-sm">
								{#if s.next}
									<span class={overdue ? 'text-amber-700' : ''}
										>{overdue ? 'Overdue' : 'Next'} {shortDate(s.next.row.date)}</span
									>
								{:else}<span class="text-green-700">Done</span>{/if}
							</div>
							<div class="text-right tabular-nums">
								<div class="font-semibold">{peso(s.balance)}</div>
								<div class="text-xs text-gray-500">of {peso(s.grandTotal)}</div>
							</div>
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<label class="mb-3 flex items-center justify-end gap-2 text-sm text-gray-600">
				<input type="checkbox" bind:checked={showAll} /> Show all remaining rows
			</label>
			{#if groups.length === 0}
				<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
					Nothing overdue or due in the next 3 months.
				</p>
			{/if}
			{#each groups as g (g.key)}
				<section class="mb-5">
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
		{/if}
	{/if}
</main>
