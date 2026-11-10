<script lang="ts">
	// The Forecast for one Cut-off, as Account lanes (the Forecasting map's prototype, variant B):
	// one lane per Funding Account with the money coming in and every Paying source drawing on it,
	// an Unfunded lane, and a drawer for one Outflow. Figures come from `buildForecast`.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ForecastDrawer from '#lib/components/ForecastDrawer.svelte';
	import {
		buildForecast,
		cutoffOf,
		formatAmount,
		fundingCandidates,
		nextCutoff,
		openingCutoff,
		planSetFundingAccounts,
		previousCutoff,
		shortDate,
		today,
		type ForecastInput,
		type ForecastOutflow
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const todayIso = today();
	const cutoff = $derived.by(() => {
		const c = page.url.searchParams.get('cutoff');
		return c && /^\d{4}-\d{2}-\d{2}$/.test(c) ? cutoffOf(c) : openingCutoff(todayIso);
	});
	function go(c: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('cutoff', c);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, query only
		goto(url, { replaceState: true });
	}

	const input = $derived<ForecastInput>({
		chart: ledger.chart,
		scheduled: ledger.scheduled,
		installments: ledger.installments,
		forecasts: ledger.forecasts,
		settings: ledger.forecastSettings,
		today: todayIso
	});
	const view = $derived(ledger.ready ? buildForecast(input, cutoff) : null);

	const name = (id: string) =>
		ledger.chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ') || '(deleted Account)';
	const day = (d: string) => shortDate(d, { year: false });

	// Selecting, hovering and opening an Outflow: every card of it lights up in every lane.
	let selected = $state<string | null>(null);
	let hovered = $state<string | null>(null);
	let openKey = $state<string | null>(null);
	const lit = $derived(hovered ?? selected ?? openKey);
	const open = $derived(view?.outflows.find((o) => o.key === openKey) ?? null);
	const STRIPES = [
		'border-l-sky-500',
		'border-l-fuchsia-500',
		'border-l-orange-500',
		'border-l-teal-500',
		'border-l-indigo-500'
	];
	const stripe = $derived.by(() => {
		const split = (view?.outflows ?? []).filter((o) => o.sources.length > 1);
		return (o: ForecastOutflow) => {
			const i = split.indexOf(o);
			return i < 0 ? '' : `border-l-4 ${STRIPES[i % STRIPES.length]}`;
		};
	});

	const unfundedItems = $derived(
		(view?.outflows ?? []).filter(
			(o) =>
				(o.carried === undefined || o.carried === 'in') &&
				(o.unfunded > 0 || o.sources.some((s) => !s.valid && s.amount > s.paid))
		)
	);

	// Funding Accounts: pick per Cut-off.
	let managing = $state(false);
	let picked = $state<string[]>([]);
	let fundingError = $state('');
	function manage() {
		picked = [...(view?.fundingAccounts ?? [])];
		fundingError = '';
		managing = true;
	}
	async function saveFunding(ids: string[]) {
		fundingError = '';
		try {
			await ledger.commit(planSetFundingAccounts(input, cutoff, ids, new Date()));
			managing = false;
		} catch (err) {
			fundingError = (err as Error).message;
		}
	}
	const candidates = $derived(
		fundingCandidates(ledger.chart)
			.map((a) => ({ id: a.id, label: name(a.id) }))
			.sort((a, b) => a.label.localeCompare(b.label))
	);

	function recordInflow(planId: string, due: string) {
		const back = encodeURIComponent(`/forecast?cutoff=${cutoff}`);
		const url = `${resolve('/transactions/new')}?plan=${encodeURIComponent(planId)}&due=${due}&back=${back}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(url);
	}
</script>

<div class="flex">
	<main class="min-w-0 flex-1 px-4 py-6">
		{#if ledger.error}
			<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
		{:else if !view}
			<p class="text-sm text-gray-500">Loading your Forecast…</p>
		{:else}
			<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
				<div>
					<div class="flex items-center gap-2">
						<button
							class="rounded border px-2 py-0.5"
							aria-label="Previous Cut-off"
							onclick={() => go(previousCutoff(cutoff))}>←</button
						>
						<h1 class="text-2xl font-semibold">Forecast · {shortDate(cutoff)}</h1>
						<button
							class="rounded border px-2 py-0.5"
							aria-label="Next Cut-off"
							onclick={() => go(nextCutoff(cutoff))}>→</button
						>
						<input
							type="date"
							class="rounded border-gray-300 py-0.5 text-sm"
							aria-label="Jump to the Cut-off of a date"
							onchange={(e) => e.currentTarget.value && go(cutoffOf(e.currentTarget.value))}
						/>
						{#if cutoff !== openingCutoff(todayIso)}
							<button class="text-sm underline" onclick={() => go(openingCutoff(todayIso))}
								>Today</button
							>
						{/if}
					</div>
					<p class="text-sm text-gray-500">
						Pay received {day(view.inflowWindow.from)}–{day(view.inflowWindow.to)} funds what's due
						{day(view.fundedWindow.from)}–{day(view.fundedWindow.to)}.
					</p>
				</div>
				<div class="flex flex-wrap gap-2 text-sm">
					<div class="rounded-lg border bg-white px-3 py-1.5">
						Outflows <b class="tabular-nums">{formatAmount(view.totals.outflows)}</b>
						<span class="text-gray-500">· paid {formatAmount(view.totals.paid)}</span>
					</div>
					<div
						class="rounded-lg border px-3 py-1.5 {view.totals.unfunded
							? 'border-amber-300 bg-amber-50 text-amber-800'
							: 'bg-white'}"
					>
						Unfunded <b class="tabular-nums">{formatAmount(view.totals.unfunded)}</b>
					</div>
					<div
						class="rounded-lg border px-3 py-1.5 {view.totals.short
							? 'border-red-300 bg-red-50 text-red-700'
							: 'bg-white'}"
					>
						Short <b class="tabular-nums">{formatAmount(view.totals.short)}</b>
					</div>
				</div>
			</div>

			<div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
				<button class="rounded border bg-white px-2 py-1" onclick={manage}>Funding Accounts…</button
				>
				{#if !view.storedFunding}<span class="text-xs text-gray-500"
						>Same as the previous Cut-off until you change them.</span
					>{/if}
				<span class="text-xs text-gray-400"
					>Click selects · double-click opens · hover lights up every part of an Outflow</span
				>
			</div>

			{#if managing}
				<div class="mb-3 max-w-xl rounded-lg border bg-white p-3 text-sm">
					<p class="mb-2 font-medium">Funding Accounts for {shortDate(cutoff)}</p>
					<div class="grid gap-1 sm:grid-cols-2">
						{#each candidates as c (c.id)}
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									checked={picked.includes(c.id)}
									onchange={(e) =>
										(picked = e.currentTarget.checked
											? [...picked, c.id]
											: picked.filter((x) => x !== c.id))}
								/>
								{c.label}
							</label>
						{:else}<span class="text-gray-500">No Asset Leaf Accounts yet.</span>{/each}
					</div>
					{#if fundingError}<p class="mt-2 text-red-600">{fundingError}</p>{/if}
					<div class="mt-3 flex gap-2">
						<button
							class="rounded bg-gray-900 px-3 py-1 text-white"
							onclick={() => saveFunding(picked)}>Save</button
						>
						<button class="rounded border px-3 py-1" onclick={() => (managing = false)}
							>Cancel</button
						>
					</div>
				</div>
			{/if}

			{#snippet card(o: ForecastOutflow, amount: number, paid: number, sourceNote: string)}
				<button
					class="mt-1 block w-full rounded border px-2 py-1 text-left text-sm {stripe(o)} {lit ===
					o.key
						? 'border-sky-400 bg-sky-50 ring-2 ring-sky-300'
						: 'hover:bg-gray-50'} {o.carried && o.carried !== 'in' ? 'opacity-50' : ''} {paid >=
						amount && amount > 0
						? 'text-gray-400'
						: ''}"
					onclick={() => (selected = o.key)}
					ondblclick={() => (openKey = o.key)}
					onmouseenter={() => (hovered = o.key)}
					onmouseleave={() => (hovered = null)}
				>
					<span class="mr-1 text-xs text-gray-400">{paid >= amount && amount > 0 ? '✓' : '○'}</span
					>{o.label}
					<span class="float-right tabular-nums">{formatAmount(amount)}</span>
					<span class="block text-xs text-gray-500">
						{o.section.name} · due {day(o.date)}{sourceNote}{o.ealloc
							? ' · E.Alloc'
							: ''}{o.allocatedIn ? ` · allocated in ${day(o.allocatedIn)}` : ''}{o.carried &&
						o.carried !== 'in'
							? ` · carried to ${day(o.carried)}`
							: ''}
					</span>
					{#if o.charges?.length}<span class="block text-xs text-gray-500"
							>{o.charges.length} {o.charges.length === 1 ? 'charge' : 'charges'}</span
						>{/if}
				</button>
			{/snippet}

			<div class="flex gap-3 overflow-x-auto pb-4">
				{#if unfundedItems.length}
					<section
						class="w-64 shrink-0 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3"
						aria-label="Unfunded"
					>
						<h2 class="font-semibold text-amber-900">Unfunded</h2>
						<p class="mb-2 text-xs text-amber-800">No Funding Account pays these yet</p>
						{#each unfundedItems as o (o.key)}
							{@render card(o, o.unfunded, 0, '')}
							{#if o.usualAccounts.length}<p class="text-xs text-gray-500">
									usually {o.usualAccounts.map(name).join(', ')}
								</p>{/if}
						{/each}
					</section>
				{/if}

				{#each view.lanes as lane (lane.accountId)}
					<section
						class="w-72 shrink-0 rounded-xl border bg-white p-3 {lane.funding ? '' : 'opacity-60'}"
						aria-label={name(lane.accountId)}
					>
						<h2 class="font-semibold">{name(lane.accountId)}</h2>
						<p class="text-xs text-gray-500">Balance today {formatAmount(lane.balanceToday)}</p>
						{#if !lane.funding}
							<button
								class="mt-2 rounded border px-2 py-0.5 text-xs"
								onclick={() => saveFunding([...view.fundingAccounts, lane.accountId])}
								>Use as Funding Account</button
							>
						{:else}
							<div
								class="my-3 rounded-lg p-2 text-center {lane.plannedLeft < 0
									? 'bg-red-50 text-red-700'
									: 'bg-emerald-50 text-emerald-800'}"
							>
								<div class="text-xs">Planned left</div>
								<div class="text-xl font-semibold tabular-nums">
									{formatAmount(lane.plannedLeft)}
								</div>
								<div class="text-xs">
									in {formatAmount(lane.inn)} − out {formatAmount(lane.forecastedExp)} · left now
									{formatAmount(lane.left)}
								</div>
								{#if lane.forecastedEAlloc}<div class="text-xs">
										E.Alloc {formatAmount(lane.eAlloc)} of {formatAmount(lane.forecastedEAlloc)}
									</div>{/if}
							</div>
						{/if}

						<h3 class="mt-2 text-xs font-medium text-gray-500 uppercase">In</h3>
						{#each lane.inflows as i (i.key)}
							<div class="flex justify-between gap-2 text-sm">
								<span
									>{i.label}{#if i.late}<span
											class="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">Late</span
										>{/if}
									<span class="block text-xs text-gray-500"
										>{i.received
											? `received ${day(i.receivedOn ?? i.date)}`
											: `expected ${day(i.due)}`}{#if i.status !== 'paid'}
											· <button class="underline" onclick={() => recordInflow(i.plan.id, i.due)}
												>Record</button
											>{/if}</span
									></span
								>
								<span class="tabular-nums {i.status === 'paid' ? 'text-emerald-700' : ''}"
									>{i.varies ? 'varies' : formatAmount(i.total)}</span
								>
							</div>
						{:else}<p class="text-xs text-gray-400">Nothing expected</p>{/each}
						{#if lane.transferIn}<div class="flex justify-between text-sm text-gray-500">
								<span>Transfer in</span><span class="tabular-nums"
									>{formatAmount(lane.transferIn)}</span
								>
							</div>{/if}
						{#if lane.allocatedFor}<div class="flex justify-between text-sm text-violet-700">
								<span>Allocated earlier</span><span class="tabular-nums"
									>{formatAmount(lane.allocatedFor)}</span
								>
							</div>{/if}

						{#if lane.funding}
							<h3 class="mt-3 text-xs font-medium text-gray-500 uppercase">Out</h3>
							{#each view.outflows.flatMap((o) => o.sources
									.filter((s) => s.accountId === lane.accountId && s.valid)
									.map((s) => ({ o, s }))) as { o, s }, k (o.key + k)}
								{@render card(
									o,
									s.amount,
									s.paid,
									o.sources.length > 1
										? ` · ${o.sources.indexOf(s) + 1} of ${o.sources.length} sources, total ${formatAmount(o.total)}`
										: ''
								)}
							{:else}<p class="text-xs text-gray-400">Nothing to pay from here</p>{/each}
							{#if lane.unplanned.length}
								<h3 class="mt-3 text-xs font-medium text-gray-500 uppercase">Unplanned</h3>
								{#each lane.unplanned as u (u.txId)}
									<a
										href={resolve('/transactions/[id]', { id: u.txId })}
										class="mt-1 block rounded border border-dashed px-2 py-1 text-sm text-gray-600 hover:bg-gray-50"
									>
										{u.label}<span class="float-right tabular-nums">{formatAmount(u.amount)}</span>
										<span class="block text-xs text-gray-500"
											>recorded {day(u.date)} · lowers Left, not Planned left</span
										>
									</a>
								{/each}
							{/if}
						{/if}
					</section>
				{:else}
					<p class="text-sm text-gray-500">
						No Funding Accounts yet. Pick the Accounts you pay from with "Funding Accounts…".
					</p>
				{/each}
			</div>

			{#if view.outflows.length === 0 && view.inflows.length === 0}
				<p class="text-sm text-gray-500">
					Nothing is planned for this Cut-off. Outflows and Inflows come from your
					<a class="underline" href={resolve('/scheduled')}>Scheduled Transactions</a> and
					<a class="underline" href={resolve('/installments')}>Installment Plans</a>.
				</p>
			{/if}
		{/if}
	</main>

	{#if open && view}
		<div
			class="sticky top-0 h-screen w-96 shrink-0 overflow-y-auto border-l bg-white p-6 shadow-xl"
		>
			<ForecastDrawer outflow={open} {cutoff} {name} onclose={() => (openKey = null)} />
		</div>
	{/if}
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') {
			selected = null;
			openKey = null;
		}
	}}
/>
