<script lang="ts">
	// Scheduled: the plan list in the left pane (Active / Ended / All tabs, search, filters, sort,
	// grouping) beside the open page: Upcoming / Overdue, one plan, or the plan editor.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from '#lib/components/AccountPicker.svelte';
	import { KIND } from '#lib/components/kind.ts';
	import PaneStrip from '#lib/components/PaneStrip.svelte';
	import PaneToggle from '#lib/components/PaneToggle.svelte';
	import SplitPane from '#lib/components/SplitPane.svelte';
	import {
		ACCOUNT_TYPE_GUIDE,
		describeRule,
		formatAmount,
		groupPlans,
		nextOccurrence,
		planRows,
		REPEAT_GROUPS,
		shortDate,
		today,
		type PlanFilters,
		type TransactionKind
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { scheduledView as view } from './scheduled-view.svelte.ts';

	let { children } = $props();
	let collapsed = $state(false);

	const todayIso = today();
	const chart = $derived(ledger.chart);
	const rows = $derived(
		planRows(chart, ledger.scheduled, view.f, { today: todayIso, sort: view.sort })
	);
	const groups = $derived(groupPlans(rows, view.group));
	const openId = $derived(page.params.id);
	const active = $derived(
		ledger.scheduled.filter((p) => nextOccurrence(p, { today: todayIso })).length
	);
	const SHOW: [PlanFilters['show'], string, () => number][] = [
		['active', 'Active', () => active],
		['ended', 'Ended', () => ledger.scheduled.length - active],
		['all', 'All', () => ledger.scheduled.length]
	];

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
	const groupLabel = (key: string) =>
		view.group === 'kind'
			? KIND[key as TransactionKind].label
			: view.group === 'repeat'
				? REPEAT_GROUPS[key as keyof typeof REPEAT_GROUPS]
				: view.group === 'tag'
					? key
						? `#${key}`
						: 'No tag'
					: '';
</script>

<SplitPane storageKey="perancial.scheduled.paneCollapsed" bind:collapsed>
	{#snippet pane()}
		{#if collapsed}
			<PaneStrip
				bind:collapsed
				label="plans"
				tabs={SHOW.map(([key, label]) => ({
					key,
					short: label.slice(0, 3),
					title: `${label} plans`,
					active: view.f.show === key,
					onclick: () => {
						view.f.show = key;
						collapsed = false;
					}
				}))}
			/>
		{:else}
			<section class="flex h-full min-h-0 flex-col border-r bg-white">
				<nav aria-label="Plan status" class="flex border-b px-2">
					{#each SHOW as [key, label, count] (key)}
						<button
							onclick={() => (view.f.show = key)}
							aria-pressed={view.f.show === key}
							class="-mb-px flex-1 border-b-2 px-1 py-2.5 text-center text-xs {view.f.show === key
								? 'border-gray-900 font-semibold text-gray-900'
								: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}"
							>{label} <span class="text-gray-400">{count()}</span></button
						>
					{/each}
				</nav>

				<div class="grid gap-2 border-b p-3 text-sm">
					<div class="flex items-center gap-2 px-1">
						<a
							href={resolve('/scheduled')}
							class="text-sm font-semibold hover:underline"
							title="Upcoming and Overdue">Plans</a
						>
						<span class="text-xs text-gray-400">{rows.length} of {ledger.scheduled.length}</span>
						<a
							href={resolve('/scheduled/new')}
							class="ml-auto rounded-md bg-gray-900 px-2 py-0.5 text-xs text-white hover:bg-gray-700"
							>+ New plan</a
						>
						<PaneToggle bind:collapsed label="plans" />
					</div>
					<input
						type="search"
						bind:value={view.f.q}
						placeholder="Search Description, Note, tags, Accounts…"
						aria-label="Search"
						class="w-full rounded-lg border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
					/>
					<AccountPicker
						bind:value={view.f.accountId}
						items={accountItems.for(accountIds)}
						emptyLabel="Any Account"
						class="w-full"
					/>
					<div class="grid grid-cols-2 gap-2">
						<select
							bind:value={view.f.kind}
							aria-label="Kind"
							class="rounded border-gray-300 py-1 text-sm"
						>
							<option value="">Any kind</option>
							{#each kinds as [key, k] (key)}<option value={key}>{k.label}</option>{/each}
						</select>
						<select
							bind:value={view.f.tag}
							aria-label="Tag"
							class="rounded border-gray-300 py-1 text-sm"
							disabled={!tags.length}
						>
							<option value="">Any tag</option>
							{#each tags as t (t)}<option value={t}>#{t}</option>{/each}
						</select>
						<select
							bind:value={view.sort}
							aria-label="Sort"
							class="rounded border-gray-300 py-1 text-sm"
						>
							<option value="next">Sort: next date</option>
							<option value="description">Sort: A–Z</option>
							<option value="amount">Sort: amount</option>
						</select>
						<select
							bind:value={view.group}
							aria-label="Group"
							class="rounded border-gray-300 py-1 text-sm"
						>
							<option value="none">No grouping</option>
							<option value="kind">Group by kind</option>
							<option value="repeat">Group by repeat</option>
							<option value="tag">Group by tag</option>
						</select>
					</div>
					{#if view.filtering}
						<button
							class="justify-self-start px-1 text-xs text-sky-700 hover:underline"
							onclick={() => view.clear()}>Clear filters</button
						>
					{/if}
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto py-2">
					{#if !ledger.ready}
						<p class="px-4 py-6 text-center text-sm text-gray-500">Loading your plans…</p>
					{:else}
						{#each groups as g (g.key)}
							{#if view.group !== 'none'}
								<h2 class="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">
									{groupLabel(g.key)} <span class="font-normal">({g.rows.length})</span>
								</h2>
							{/if}
							<ul>
								{#each g.rows as { plan, next, amount, kind } (plan.id)}
									{@const v = plan.versions.at(-1)!}
									<li>
										<a
											href={resolve('/scheduled/[id]', { id: plan.id })}
											aria-current={plan.id === openId ? 'page' : undefined}
											class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-l-2 px-4 py-2 text-sm {plan.id ===
											openId
												? 'border-gray-900 bg-gray-100'
												: 'border-transparent hover:bg-gray-50'} {next ? '' : 'opacity-60'}"
										>
											<span class="truncate font-medium text-gray-900" title={v.description}
												>{v.description}</span
											>
											<span class="text-xs tabular-nums"
												>{amount === null ? 'Varies' : formatAmount(amount)}</span
											>
											<span class="truncate text-xs text-gray-500"
												>{KIND[kind].label} · {describeRule(v.rule)}</span
											>
											<span class="text-xs text-gray-500"
												>{next ? shortDate(next.date) : 'Ended'}</span
											>
										</a>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="px-4 py-6 text-center text-sm text-gray-500">
								{ledger.scheduled.length ? 'No plans match.' : 'No plans yet.'}
							</p>
						{/each}
					{/if}
				</div>
			</section>
		{/if}
	{/snippet}

	{@render children()}
</SplitPane>
