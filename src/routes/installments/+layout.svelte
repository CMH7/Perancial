<script lang="ts">
	// Installments: the plan list in the left pane (Open / Done / All tabs and a search) beside the
	// open page: the rows due by Cut-off, one plan, or the new-plan form.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PaneStrip from '#lib/components/PaneStrip.svelte';
	import PaneToggle from '#lib/components/PaneToggle.svelte';
	import SplitPane from '#lib/components/SplitPane.svelte';
	import { filterPlansList, formatAmount, plansList, shortDate, today } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let { children } = $props();
	let collapsed = $state(false);
	let show = $state<'open' | 'done' | 'all'>('open');
	let q = $state('');

	const chart = $derived(ledger.chart);
	const lines = $derived(plansList(chart, ledger.installments, { today: today() }));
	const shown = $derived(filterPlansList(chart, lines, { show, q }));
	const open = $derived(lines.filter((l) => l.summary.next).length);
	const left = $derived(lines.reduce((s, l) => s + l.summary.balance, 0));
	const openId = $derived(page.params.id);
	const SHOW = [
		['open', 'Open', () => open],
		['done', 'Done', () => lines.length - open],
		['all', 'All', () => lines.length]
	] as const;
	const accountName = (id: string) =>
		chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ') || '(deleted Account)';
</script>

<SplitPane storageKey="perancial.installments.paneCollapsed" bind:collapsed>
	{#snippet pane()}
		{#if collapsed}
			<PaneStrip
				bind:collapsed
				label="plans"
				tabs={SHOW.map(([key, label]) => ({
					key,
					short: label.slice(0, 3),
					title: `${label} plans`,
					active: show === key,
					onclick: () => {
						show = key;
						collapsed = false;
					}
				}))}
			/>
		{:else}
			<section class="flex h-full min-h-0 flex-col border-r bg-white">
				<nav aria-label="Plan status" class="flex border-b px-2">
					{#each SHOW as [key, label, count] (key)}
						<button
							onclick={() => (show = key)}
							aria-pressed={show === key}
							class="-mb-px flex-1 border-b-2 px-1 py-2.5 text-center text-xs {show === key
								? 'border-gray-900 font-semibold text-gray-900'
								: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}"
							>{label} <span class="text-gray-400">{count()}</span></button
						>
					{/each}
				</nav>

				<div class="grid gap-2 border-b p-3">
					<div class="flex items-center gap-2 px-1">
						<a
							href={resolve('/installments')}
							class="text-sm font-semibold hover:underline"
							title="Due by Cut-off">Plans</a
						>
						<span class="text-xs text-gray-400">{shown.length} of {lines.length}</span>
						<a
							href={resolve('/installments/new')}
							class="ml-auto rounded-md bg-gray-900 px-2 py-0.5 text-xs text-white hover:bg-gray-700"
							>+ New plan</a
						>
						<PaneToggle bind:collapsed label="plans" />
					</div>
					<p class="px-1 text-xs text-gray-500">
						{formatAmount(left)} left across {open} open {open === 1 ? 'plan' : 'plans'}
					</p>
					<input
						type="search"
						bind:value={q}
						placeholder="Search title or Account…"
						aria-label="Search plans"
						class="w-full rounded-lg border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
					/>
				</div>

				<ul class="min-h-0 flex-1 overflow-y-auto py-2">
					{#if !ledger.ready}
						<li class="px-4 py-6 text-center text-sm text-gray-500">Loading your plans…</li>
					{:else}
						{#each shown as { plan, summary: s, overdue } (plan.id)}
							<li>
								<a
									href={resolve('/installments/[id]', { id: plan.id })}
									aria-current={plan.id === openId ? 'page' : undefined}
									class="block border-l-2 px-4 py-2 text-sm {plan.id === openId
										? 'border-gray-900 bg-gray-100'
										: 'border-transparent hover:bg-gray-50'}"
								>
									<span class="flex items-baseline gap-3">
										<span
											class="min-w-0 flex-1 truncate font-medium text-gray-900"
											title={plan.title}>{plan.title}</span
										>
										<span class="text-xs font-semibold tabular-nums">{formatAmount(s.balance)}</span
										>
									</span>
									<span class="flex items-baseline gap-3 text-xs text-gray-500">
										<span class="min-w-0 flex-1 truncate"
											>{#if plan.kind === 'internal'}<span class="text-violet-700">Internal</span> ·
											{/if}{accountName(plan.accounts.repaid)}</span
										>
										{#if s.next}
											<span class={overdue ? 'text-amber-700' : ''}
												>{overdue ? 'Overdue' : 'Next'} {shortDate(s.next.row.date)}</span
											>
										{:else}<span class="text-green-700">Done</span>{/if}
									</span>
									<span class="mt-1.5 flex items-center gap-2">
										<span class="h-1 flex-1 rounded bg-gray-100"
											><span
												class="block h-1 rounded bg-green-500"
												style="width: {(100 * s.doneRows) / s.rowCount}%"
											></span></span
										>
										<span class="text-[10px] text-gray-400">{s.doneRows}/{s.rowCount}</span>
									</span>
								</a>
							</li>
						{:else}
							<li class="px-4 py-6 text-center text-sm text-gray-500">
								{lines.length ? 'No plans match.' : 'No Installment Plans yet.'}
							</li>
						{/each}
					{/if}
				</ul>
			</section>
		{/if}
	{/snippet}

	{@render children()}
</SplitPane>
