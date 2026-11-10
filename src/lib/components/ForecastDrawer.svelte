<script lang="ts">
	// One Outflow of a Forecast in a right-hand panel, like the Journal's Transaction panel: its
	// Section, due date, status, charges and Paying sources, with Record (all, or one source) through
	// the existing Record flow, and a link to its plan.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		formatAmount,
		formatPicks,
		recordPicks,
		shortDate,
		type ForecastOutflow
	} from '#lib/domain/index.ts';

	let {
		outflow: o,
		cutoff,
		name,
		onclose
	}: {
		outflow: ForecastOutflow;
		cutoff: string;
		name: (id: string) => string;
		onclose: () => void;
	} = $props();

	const all = $derived(recordPicks(o, 'all'));
	const planHref = $derived(
		o.link.plan === 'scheduled'
			? resolve('/scheduled/[id]', { id: o.link.planId })
			: resolve('/installments/[id]', { id: o.link.planId })
	);
	const statusLabel = $derived(
		o.status === 'paid' ? 'Paid' : o.status === 'partly-paid' ? 'Partly Paid' : 'Unpaid'
	);

	function record(which: 'all' | string) {
		const picks = recordPicks(o, which);
		if (!picks.length) return;
		const key = o.link.plan === 'scheduled' ? 'plan' : 'installment';
		const back = encodeURIComponent(`/forecast?cutoff=${cutoff}`);
		const url = `${resolve('/transactions/new')}?${key}=${encodeURIComponent(o.link.planId)}&due=${o.link.due}&sources=${formatPicks(picks)}&back=${back}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(url);
	}
</script>

<aside class="space-y-4 text-sm" aria-label="Outflow detail">
	<div class="flex items-start justify-between gap-2">
		<div>
			<p class="text-xs text-gray-500">{o.section.name}</p>
			<h2 class="text-lg font-semibold">{o.label}</h2>
		</div>
		<button onclick={onclose} class="text-gray-400 hover:text-gray-900" aria-label="Close">✕</button
		>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span
			class="rounded-full px-2 py-0.5 text-xs {o.status === 'paid'
				? 'bg-emerald-100 text-emerald-800'
				: o.status === 'partly-paid'
					? 'bg-sky-100 text-sky-800'
					: o.overdue
						? 'bg-amber-100 text-amber-800'
						: 'bg-gray-100 text-gray-700'}">{o.overdue ? 'Overdue' : statusLabel}</span
		>
		<span class="text-gray-500">due {shortDate(o.date)}</span>
		<span class="ml-auto font-semibold tabular-nums">{formatAmount(o.total)}</span>
	</div>
	{#if o.additional || o.less}
		<p class="text-xs text-gray-500">
			Amount {formatAmount(o.amount)}{o.additional
				? ` + ${formatAmount(o.additional)} additional`
				: ''}{o.less ? ` · ${formatAmount(o.less)} less` : ''}
		</p>
	{/if}
	{#if o.varies}<p class="text-xs text-amber-700">
			The amount varies. Set it for this occurrence on its plan.
		</p>{/if}
	{#if o.ealloc}<p class="text-xs text-violet-700">
			E.Alloc: sets money aside for an Outflow due {shortDate(o.ealloc.due)}.
		</p>{/if}
	{#if o.allocatedIn}<p class="text-xs text-violet-700">
			Allocated in the {shortDate(o.allocatedIn)} Cut-off.
		</p>{/if}
	{#if o.carried === 'in'}<p class="text-xs text-amber-700">Carried over: still unpaid.</p>{/if}
	{#if o.carried && o.carried !== 'in'}<p class="text-xs text-gray-500">
			Carried to the {shortDate(o.carried)} Forecast; this one keeps only what was paid.
		</p>{/if}

	{#if o.charges}
		<div>
			<p class="mb-1 text-xs font-semibold text-gray-500 uppercase">
				Charges on {o.liabilityId ? name(o.liabilityId) : 'this Liability'}
			</p>
			{#each o.charges as c (c.key)}
				<div class="flex justify-between gap-2 border-b py-1">
					<span
						>{c.label}
						<span class="text-xs text-gray-500"
							>{c.from === 'transaction' ? 'recorded' : 'planned'}
							{shortDate(c.date, {
								year: false
							})}</span
						></span
					>
					<span class="tabular-nums">{formatAmount(c.amount)}</span>
				</div>
			{:else}<p class="text-xs text-gray-400">No charges since the last payment.</p>{/each}
		</div>
	{/if}

	<div>
		<p class="mb-1 text-xs font-semibold text-gray-500 uppercase">Paying sources</p>
		{#each o.sources as s (s.accountId)}
			<div class="flex items-center justify-between gap-2 py-1">
				<span class={s.valid ? '' : 'text-amber-700'}
					>{name(s.accountId)}{#if !s.valid}<span class="block text-xs"
							>Not a Funding Account this Cut-off</span
						>{/if}</span
				>
				<span class="flex items-center gap-2">
					<span class="tabular-nums">{formatAmount(s.amount)}</span>
					{#if s.amount > 0 && s.paid >= s.amount}<span class="text-emerald-700">Paid</span
						>{:else if s.valid}<button class="underline" onclick={() => record(s.accountId)}
							>Record</button
						>{/if}
				</span>
			</div>
		{:else}<p class="text-xs text-gray-400">No Paying source yet.</p>{/each}
		{#if o.unfunded}<p class="mt-1 text-amber-700">Unfunded {formatAmount(o.unfunded)}</p>{/if}
		{#if o.usualAccounts.length}<p class="text-xs text-gray-500">
				Usually paid from {o.usualAccounts.map(name).join(', ')}.
			</p>{/if}
	</div>

	<div class="flex flex-wrap gap-2">
		{#if all.length}
			<button class="rounded bg-gray-900 px-3 py-1.5 text-white" onclick={() => record('all')}
				>Record all</button
			>
		{/if}
		<a class="rounded border px-3 py-1.5" href={planHref}>Open plan ↗</a>
	</div>
</aside>
