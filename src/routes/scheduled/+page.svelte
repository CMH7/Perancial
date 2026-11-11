<script lang="ts">
	// Scheduled: two tabs, Upcoming (overdue first, then the next 30 days) and Plans, sharing one
	// search and set of filters. Plans can also be sorted and grouped. Filters survive Back.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from '#lib/components/AccountPicker.svelte';
	import { KIND } from '#lib/components/kind.ts';
	import OccurrenceRow from '#lib/components/OccurrenceRow.svelte';
	import {
		ACCOUNT_TYPE_GUIDE,
		describeRule,
		filterUpcoming,
		formatAmount,
		groupPlans,
		noPlanFilters,
		planRows,
		REPEAT_GROUPS,
		shortDate,
		today,
		upcoming,
		UPCOMING_DAYS,
		type PlanFilters,
		type PlanGroup,
		type PlanSort,
		type TransactionKind
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import type { Snapshot } from './$types';

	let f = $state(noPlanFilters());
	let sort = $state<PlanSort>('next');
	let group = $state<PlanGroup>('none');

	export const snapshot: Snapshot<{
		f: PlanFilters;
		sort: PlanSort;
		group: PlanGroup;
	}> = {
		capture: () => ({ f: $state.snapshot(f), sort, group }),
		restore: (s) => {
			f = s.f;
			sort = s.sort;
			group = s.group;
		}
	};

	const todayIso = today();
	type Tab = 'upcoming' | 'overdue' | 'plans';
	const tab = $derived.by((): Tab => {
		const t = page.url.searchParams.get('tab');
		return t === 'plans' || t === 'overdue' ? t : 'upcoming';
	});
	function show(next: Tab) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/scheduled')}${next === 'upcoming' ? '' : `?tab=${next}`}`, {
			replaceState: true
		});
	}

	const chart = $derived(ledger.chart);
	const allUpcoming = $derived(
		upcoming(chart, ledger.scheduled, { today: todayIso, installments: ledger.installments })
	);
	// Overdue (oldest first) gets its own tab; Upcoming keeps today and the next 30 days.
	const allOverdue = $derived(allUpcoming.filter((v) => v.status.overdue));
	const allDue = $derived(allUpcoming.filter((v) => !v.status.overdue));
	const list = $derived(filterUpcoming(chart, tab === 'overdue' ? allOverdue : allDue, f));
	const listTotal = $derived(tab === 'overdue' ? allOverdue.length : allDue.length);
	const listWhat = $derived(
		tab === 'overdue' ? 'overdue' : `due today or in the next ${UPCOMING_DAYS} days`
	);
	const rows = $derived(planRows(chart, ledger.scheduled, f, { today: todayIso, sort }));
	const groups = $derived(groupPlans(rows, group));

	const tags = $derived(
		[...new Set(ledger.scheduled.flatMap((p) => p.versions.at(-1)!.tags))].sort()
	);
	const accountIds = $derived(
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
				.map((a) => a.id)
		)
	);
	const kinds = Object.entries(KIND) as [TransactionKind, (typeof KIND)[TransactionKind]][];
	/** The search and filters both tabs share; Clear resets these and keeps the Plans status. */
	const filtering = $derived(!!(f.q || f.kind || f.accountId || f.tag));

	const groupLabel = (key: string) =>
		group === 'kind'
			? KIND[key as TransactionKind].label
			: group === 'repeat'
				? REPEAT_GROUPS[key as keyof typeof REPEAT_GROUPS]
				: group === 'tag'
					? key
						? `#${key}`
						: 'No tag'
					: '';
</script>

<main class="mx-auto max-w-4xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your plans…</p>
	{:else}
		<div class="mb-4 flex items-center justify-between">
			<h1 class="text-2xl font-semibold">Scheduled</h1>
			<a href={resolve('/scheduled/new')} class="rounded bg-gray-900 px-3 py-1.5 text-sm text-white"
				>New plan</a
			>
		</div>

		<div class="mb-4 flex gap-1 border-b text-sm">
			{#each [['upcoming', 'Upcoming', allDue.length], ['overdue', 'Overdue', allOverdue.length], ['plans', 'Plans', ledger.scheduled.length]] as const as [key, label, count] (key)}
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
			<div class="mb-2 flex flex-wrap gap-2 text-sm">
				<input
					type="search"
					bind:value={f.q}
					placeholder="Search Description, Note, tags, Accounts…"
					aria-label="Search"
					class="w-72 rounded border-gray-300 text-sm"
				/>
				<select bind:value={f.kind} aria-label="Kind" class="rounded border-gray-300 text-sm">
					<option value="">Any kind</option>
					{#each kinds as [key, k] (key)}<option value={key}>{k.label}</option>{/each}
				</select>
				<AccountPicker
					bind:value={f.accountId}
					items={accountItems.for(accountIds)}
					emptyLabel="Any Account"
					class="w-56"
				/>
				{#if tags.length}
					<select bind:value={f.tag} aria-label="Tag" class="rounded border-gray-300 text-sm">
						<option value="">Any tag</option>
						{#each tags as t (t)}<option value={t}>#{t}</option>{/each}
					</select>
				{/if}
				{#if tab === 'plans'}
					<select bind:value={f.show} aria-label="Status" class="rounded border-gray-300 text-sm">
						<option value="active">Active</option>
						<option value="ended">Ended</option>
						<option value="all">Active and ended</option>
					</select>
					<select bind:value={sort} aria-label="Sort" class="rounded border-gray-300 text-sm">
						<option value="next">Sort: next date</option>
						<option value="description">Sort: Description A–Z</option>
						<option value="amount">Sort: amount, largest first</option>
					</select>
					<select bind:value={group} aria-label="Group" class="rounded border-gray-300 text-sm">
						<option value="none">No grouping</option>
						<option value="kind">Group by kind</option>
						<option value="repeat">Group by repeat</option>
						<option value="tag">Group by tag</option>
					</select>
				{/if}
				{#if filtering}
					<button
						class="text-sky-700 hover:underline"
						onclick={() => (f = { ...noPlanFilters(), show: f.show })}>Clear</button
					>
				{/if}
			</div>

			{#if tab !== 'plans'}
				<p class="mb-3 text-xs text-gray-500">{list.length} of {listTotal} {listWhat}</p>
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
						{#each list as view (`${view.plan.id}:${view.occurrence.due}`)}
							<OccurrenceRow {view} />
						{/each}
					</ul>
				{/if}
			{:else}
				<p class="mb-3 text-xs text-gray-500">
					{rows.length} of {ledger.scheduled.length} plans
				</p>
				{#each groups as g (g.key)}
					{#if group !== 'none'}
						<h2 class="mt-4 mb-2 text-sm font-semibold text-gray-500 uppercase">
							{groupLabel(g.key)} <span class="font-normal">({g.rows.length})</span>
						</h2>
					{/if}
					<ul class="divide-y rounded-xl border bg-white text-sm">
						{#each g.rows as { plan, next, amount, kind } (plan.id)}
							{@const v = plan.versions.at(-1)!}
							<li>
								<a
									href={resolve('/scheduled/[id]', { id: plan.id })}
									class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
								>
									<span class="min-w-0">
										<span class="block truncate font-medium">
											{v.description}
											{#each v.tags as t (t)}<span class="ml-1 text-xs font-normal text-gray-500"
													>#{t}</span
												>{/each}
										</span>
										<span class="block text-xs text-gray-500">{describeRule(v.rule)}</span>
									</span>
									<span class="flex shrink-0 items-center gap-3 text-right">
										<span class="rounded-full px-2 py-0.5 text-xs {KIND[kind].style}"
											>{KIND[kind].label}</span
										>
										<span class="w-28 tabular-nums"
											>{amount === null ? 'Varies' : formatAmount(amount)}</span
										>
										<span class="w-24 text-xs text-gray-500"
											>{next ? `Next ${shortDate(next.date)}` : 'Ended'}</span
										>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
						No plans match.
					</p>
				{/each}
			{/if}
		{/if}
	{/if}
</main>
