<script lang="ts">
	// The Forecast for one Cut-off, as Account lanes (the Forecasting map's prototype, variant B):
	// one lane per Funding Account with the money coming in and every Paying source drawing on it,
	// an Unfunded lane, and a drawer for one Outflow. Figures come from `buildForecast`.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import AllocatePanel from '#lib/components/AllocatePanel.svelte';
	import ForecastAddPanel from '#lib/components/ForecastAddPanel.svelte';
	import Drawer from '#lib/components/Drawer.svelte';
	import ForecastDrawer from '#lib/components/ForecastDrawer.svelte';
	import FundingWallet from '#lib/components/FundingWallet.svelte';
	import PesoMark from '#lib/components/PesoMark.svelte';
	import {
		buildForecast,
		expectedAtEnd,
		shortAtEnd,
		cutoffOf,
		formatAmount,
		formatPicks,
		moveSource,
		parseAmount,
		placeItem,
		planSetOutflowOrder,
		planSetSources,
		recordPicks,
		recordQuery,
		splitSource,
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
	import { accountItems } from '#lib/account-items.svelte.ts';
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
		statements: ledger.statements,
		settings: ledger.forecastSettings,
		today: todayIso
	});
	const view = $derived(ledger.ready ? buildForecast(input, cutoff) : null);
	/** Each Account's expected Balance when this Cut-off ends; empty once it is over. */
	const expected = $derived(
		ledger.ready ? expectedAtEnd(input, cutoff) : new Map<string, number>()
	);
	const short = $derived(view ? shortAtEnd(view, expected) : 0);

	const name = (id: string) =>
		ledger.chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ') || '(deleted Account)';
	const day = (d: string) => shortDate(d, { year: false });
	/** The Group an Account sits in (its Account Type's top-level Group at the top). */
	const groupOf = (id: string) =>
		ledger.chart
			.path(id)
			.slice(0, -1)
			.map((a) => a.name)
			.at(-1) ?? '';

	// Selecting, hovering and opening an Outflow: every card of it lights up in every lane.
	// A card is one Paying source of an Outflow (`from`), or its Unfunded part (`from` null).
	type CardRef = { key: string; from: string | null };
	let selected = $state<CardRef | null>(null);
	let hovered = $state<string | null>(null);
	let openKey = $state<string | null>(null);
	const lit = $derived(hovered ?? selected?.key ?? openKey);
	const outflowOf = (key: string) => view?.outflows.find((o) => o.key === key);

	// Editing sources from the lanes: drag a card to another lane (moves that source), or
	// Ctrl+C a selected card and click a lane (splits off an amount). Both save the same `sources`.
	let actionError = $state('');
	async function saveSources(o: ForecastOutflow, sources: { accountId: string; amount: number }[]) {
		actionError = '';
		try {
			await ledger.commit(planSetSources(input, cutoff, o, sources, new Date()));
		} catch (err) {
			actionError = (err as Error).message;
		}
	}
	let dragging = $state<CardRef | null>(null);
	let overLane = $state<string | null>(null);
	/** Where a dragged card would land: before or after this card in this lane. */
	let dropAt = $state<{ lane: string; key: string; after: boolean } | null>(null);
	async function drop(lane: string, at: { key: string; after: boolean } | null = null) {
		overLane = null;
		dropAt = null;
		const d = dragging;
		dragging = null;
		const o = d && outflowOf(d.key);
		if (!o || !d || !view) return;
		if (d.from === lane && (!at || at.key === d.key)) return;
		actionError = '';
		try {
			const now = new Date();
			const writes =
				d.from === lane
					? []
					: planSetSources(
							input,
							cutoff,
							o,
							d.from === null
								? splitSource(o.sources, null, lane, o.unfunded)
								: moveSource(o.sources, d.from, lane),
							now
						);
			if (at) {
				const keys = placeItem(
					view.outflows.map((x) => x.key),
					d.key,
					at.after ? { after: at.key } : { before: at.key }
				);
				writes.push(...planSetOutflowOrder(input, cutoff, keys, now));
			}
			await ledger.commit(writes);
		} catch (err) {
			actionError = (err as Error).message;
		}
	}
	let copied = $state<CardRef | null>(null);
	let paste = $state<{ ref: CardRef; lane: string; amount: string } | null>(null);
	const text = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
	function laneClick(lane: string) {
		const o = copied && outflowOf(copied.key);
		if (!o || !copied || copied.from === lane) return;
		const src = o.sources.find((s) => s.accountId === copied!.from);
		const amount = src ? src.amount - src.paid : o.unfunded;
		paste = { ref: copied, lane, amount: text(amount) };
	}
	function confirmPaste() {
		const p = paste;
		const o = p && outflowOf(p.ref.key);
		const cents = p ? parseAmount(p.amount) : null;
		paste = null;
		copied = null;
		if (!o || !p || !cents || cents <= 0) return;
		try {
			saveSources(o, splitSource(o.sources, p.ref.from, p.lane, cents));
		} catch (err) {
			actionError = (err as Error).message;
		}
	}

	// Right-click or hold a card: a menu. "Show in all Funding Accounts" filters every lane to
	// that Outflow's cards; nothing is removed.
	let menu = $state<{ ref: CardRef; x: number; y: number } | null>(null);
	let onlyKey = $state<string | null>(null);
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	let pressAt: { x: number; y: number } | null = null;
	function pressStart(e: PointerEvent, ref: CardRef) {
		const { clientX: x, clientY: y } = e;
		pressAt = { x, y };
		pressTimer = setTimeout(() => ((menu = { ref, x, y }), (pressAt = null)), 550);
	}
	function pressEnd() {
		clearTimeout(pressTimer);
		pressAt = null;
	}
	// Moving away from where it was pressed (a drag starting) is not a hold.
	function pressMove(e: PointerEvent) {
		if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 6) pressEnd();
	}

	// Reordering lanes: drag a Funding Account's header, or use the arrow keys on it.
	let laneDrag = $state<string | null>(null);
	let laneAt = $state<{ id: string; after: boolean } | null>(null);
	function moveLane(id: string, at: { before?: string; after?: string }) {
		const ids = view?.fundingAccounts ?? [];
		const next = placeItem(ids, id, at);
		if (next.join() !== ids.join()) saveFunding(next);
	}
	function dropLane() {
		const id = laneDrag;
		const at = laneAt;
		laneDrag = null;
		laneAt = null;
		if (id && at && at.id !== id) moveLane(id, at.after ? { after: at.id } : { before: at.id });
	}
	function laneKey(e: KeyboardEvent, id: string) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const ids = view?.fundingAccounts ?? [];
		const i = ids.indexOf(id);
		const j = i + (e.key === 'ArrowLeft' ? -1 : 1);
		if (i < 0 || j < 0 || j >= ids.length) return;
		moveLane(id, e.key === 'ArrowLeft' ? { before: ids[j] } : { after: ids[j] });
	}
	function recordAll(o: ForecastOutflow) {
		const picks = recordPicks(o, 'all');
		if (!picks.length) return;
		const back = encodeURIComponent(`/forecast?cutoff=${cutoff}`);
		const url = `${resolve('/transactions/new')}?${recordQuery(o.link)}&sources=${formatPicks(picks)}&back=${back}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(url);
	}
	const planHref = (o: ForecastOutflow) =>
		o.link.plan === 'scheduled'
			? resolve('/scheduled/[id]', { id: o.link.planId })
			: o.link.plan === 'installment'
				? resolve('/installments/[id]', { id: o.link.planId })
				: resolve('/accounts/[id]', { id: o.link.planId });
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

	let allocating = $state(false);
	let adding = $state<'outflow' | 'inflow' | null>(null);

	// Funding Accounts: pick per Cut-off.
	let managing = $state(false);
	let picked = $state<string[]>([]);
	let fundingError = $state('');
	function manage() {
		picked = [...(view?.fundingAccounts ?? [])];
		fundingError = '';
		adding = null;
		openKey = null;
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
	// The wallet's cards: every Account that can be a Funding Account, in chart order.
	const walletItems = $derived(
		accountItems
			.for(fundingCandidates(ledger.chart).map((a) => a.id))
			.sort((a, b) => a.order - b.order)
	);

	function recordInflow(planId: string, due: string) {
		const back = encodeURIComponent(`/forecast?cutoff=${cutoff}`);
		const url = `${resolve('/transactions/new')}?plan=${encodeURIComponent(planId)}&due=${due}&back=${back}`;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(url);
	}
</script>

<div class="flex">
	<!-- Fills the window under the nav bar: the header stays put and only the lanes area scrolls. -->
	<main class="flex h-[calc(100dvh-var(--nav-h,0px))] min-w-0 flex-1 flex-col px-4 pt-6">
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
						Pay received {day(view.inflowWindow.from)}–{day(view.inflowWindow.to)} funds what's due in
						the same days.
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
						class="rounded-lg border px-3 py-1.5 {short
							? 'border-red-300 bg-red-50 text-red-700'
							: 'bg-white'}"
						title={expected.size
							? 'Funding Accounts expected to end this Cut-off below zero, added up'
							: 'Funding Accounts whose Planned left is below zero, added up'}
					>
						Short <b class="tabular-nums">{formatAmount(short)}</b>
					</div>
				</div>
			</div>

			{#if copied || onlyKey || actionError}
				<div
					class="mb-2 flex flex-wrap items-center gap-3 rounded-lg bg-sky-50 px-3 py-1.5 text-sm text-sky-900"
				>
					{#if copied}<span
							>Copied <b>{outflowOf(copied.key)?.label}</b>: click a Funding Account's lane to add
							it there. Esc cancels.</span
						>{/if}
					{#if onlyKey}<span>Showing only <b>{outflowOf(onlyKey)?.label}</b>.</span>
						<button class="underline" onclick={() => (onlyKey = null)}>Show all</button>{/if}
					{#if actionError}<span class="text-red-700">{actionError}</span>{/if}
				</div>
			{/if}

			<div class="mb-3 flex flex-wrap items-center gap-2 text-sm">
				<button class="rounded border bg-white px-2 py-1" onclick={manage}>Funding Accounts…</button
				>
				<button
					class="rounded border bg-white px-2 py-1"
					onclick={() => {
						managing = false;
						adding = null;
						openKey = null;
						allocating = true;
					}}>Allocate early…</button
				>
				<button
					class="rounded border bg-white px-2 py-1"
					onclick={() => ((adding = 'outflow'), (openKey = null), (managing = false))}
					>+ Outflow</button
				>
				<button
					class="rounded border bg-white px-2 py-1"
					onclick={() => ((adding = 'inflow'), (openKey = null), (managing = false))}
					>+ Inflow</button
				>
				{#if !view.storedFunding}<span class="text-xs text-gray-500"
						>Same as the previous Cut-off until you change them.</span
					>{/if}
				<span class="text-xs text-gray-400"
					>Click selects · double-click opens · drag moves a source · Ctrl+C then click a lane
					splits it · right-click or hold for more</span
				>
			</div>

			{#snippet card(
				o: ForecastOutflow,
				from: string | null,
				amount: number,
				paid: number,
				sourceNote: string
			)}
				{@const movable = paid === 0 && (o.carried === undefined || o.carried === 'in')}
				<button
					draggable={movable}
					ondragstart={() => (pressEnd(), (dragging = { key: o.key, from }))}
					ondragend={() => ((dragging = null), (overLane = null), (dropAt = null))}
					ondragover={(e) => {
						if (!dragging || from === null || !view?.fundingAccounts.includes(from)) return;
						e.preventDefault();
						e.stopPropagation();
						const r = e.currentTarget.getBoundingClientRect();
						overLane = from;
						dropAt = { lane: from, key: o.key, after: e.clientY > r.top + r.height / 2 };
					}}
					ondrop={(e) => {
						if (!dropAt || from === null) return;
						e.preventDefault();
						e.stopPropagation();
						drop(from, dropAt);
					}}
					onpointermove={pressMove}
					onpointercancel={pressEnd}
					oncontextmenu={(e) => {
						e.preventDefault();
						menu = { ref: { key: o.key, from }, x: e.clientX, y: e.clientY };
					}}
					onpointerdown={(e) => pressStart(e, { key: o.key, from })}
					onpointerup={pressEnd}
					class="mt-1 block w-full rounded border px-2 py-1 text-left text-sm {dropAt?.lane ===
						from && dropAt?.key === o.key
						? dropAt.after
							? 'shadow-[0_3px_0_var(--color-sky-500)]'
							: 'shadow-[0_-3px_0_var(--color-sky-500)]'
						: ''} {stripe(o)} {lit === o.key
						? 'border-sky-400 bg-sky-50 ring-2 ring-sky-300'
						: 'hover:bg-gray-50'} {movable ? 'cursor-grab' : ''} {o.carried && o.carried !== 'in'
						? 'opacity-50'
						: ''} {paid >= amount && amount > 0 ? 'text-gray-400' : ''}"
					onclick={(e) => {
						e.stopPropagation();
						selected = { key: o.key, from };
					}}
					ondblclick={() => ((openKey = o.key), (adding = null), (managing = false))}
					onmouseenter={() => (hovered = o.key)}
					onmouseleave={() => {
						hovered = null;
						pressEnd();
					}}
				>
					<span class="mr-1 text-xs text-gray-400">{paid >= amount && amount > 0 ? '✓' : '○'}</span
					>{o.label}
					<span class="float-right tabular-nums">{formatAmount(amount)}</span>
					<span class="block text-xs text-gray-500">
						{o.section.name} · {o.statement && o.statement.dueDate !== o.date
							? `pay ${day(o.date)} · due ${day(o.statement.dueDate)}`
							: `due ${day(o.date)}`}{o.statement && o.statement.entered === null
							? ' · estimated'
							: ''}{sourceNote}{o.ealloc ? ' · E.Alloc' : ''}{o.allocatedIn
							? ` · allocated in ${day(o.allocatedIn)}`
							: ''}{o.allocationGap
							? ` · reserve ${formatAmount(Math.abs(o.allocationGap))} ${o.allocationGap > 0 ? 'short' : 'over'}`
							: ''}{o.carried && o.carried !== 'in' ? ` · carried to ${day(o.carried)}` : ''}
					</span>
					{#if o.charges?.length}<span class="block text-xs text-gray-500"
							>{o.charges.length} {o.charges.length === 1 ? 'charge' : 'charges'}</span
						>{/if}
				</button>
			{/snippet}

			{#if view.outflows.length === 0 && view.inflows.length === 0}
				<p class="text-sm text-gray-500">
					Nothing is planned for this Cut-off. Outflows and Inflows come from your
					<a class="underline" href={resolve('/scheduled')}>Scheduled Transactions</a> and
					<a class="underline" href={resolve('/installments')}>Installment Plans</a>.
				</p>
			{/if}

			<div class="flex min-h-0 flex-1 items-start gap-3 overflow-auto pb-4">
				{#if unfundedItems.length}
					<section
						class="w-64 shrink-0 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3"
						aria-label="Unfunded"
					>
						<h2 class="font-semibold text-amber-900">Unfunded</h2>
						<p class="mb-2 text-xs text-amber-800">No Funding Account pays these yet</p>
						{#each unfundedItems.filter((o) => !onlyKey || o.key === onlyKey) as o (o.key)}
							{@render card(o, null, o.unfunded, 0, '')}
							{#if o.usualAccounts.length}<p class="text-xs text-gray-500">
									usually {o.usualAccounts.map(name).join(', ')}
								</p>{/if}
						{/each}
					</section>
				{/if}

				{#each view.lanes as lane (lane.accountId)}
					<!-- A lane is a drop and paste target; Enter on a focused lane pastes too. -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
					<section
						tabindex={copied && lane.funding ? 0 : -1}
						onkeydown={(e) => e.key === 'Enter' && lane.funding && laneClick(lane.accountId)}
						class="w-72 shrink-0 rounded-xl border bg-white p-3 {lane.funding
							? ''
							: 'opacity-60'} {overLane === lane.accountId
							? 'ring-2 ring-sky-400'
							: ''} {laneAt?.id === lane.accountId
							? laneAt.after
								? 'shadow-[4px_0_0_var(--color-sky-500)]'
								: 'shadow-[-4px_0_0_var(--color-sky-500)]'
							: ''} {laneDrag === lane.accountId ? 'opacity-50' : ''} {copied && lane.funding
							? 'cursor-copy outline-2 outline-sky-300 outline-dashed'
							: ''}"
						aria-label={name(lane.accountId)}
						role="list"
						ondragover={(e) => {
							if (laneDrag && lane.funding) {
								e.preventDefault();
								const r = e.currentTarget.getBoundingClientRect();
								laneAt = { id: lane.accountId, after: e.clientX > r.left + r.width / 2 };
							} else if (lane.funding && dragging) {
								e.preventDefault();
								overLane = lane.accountId;
								dropAt = null;
							}
						}}
						ondragleave={() => (overLane = null)}
						ondrop={() => (laneDrag ? dropLane() : lane.funding && drop(lane.accountId))}
						onclick={() => lane.funding && laneClick(lane.accountId)}
					>
						{#if lane.funding}
							{@const atEnd = expected.get(lane.accountId)}
							{@const headline = atEnd ?? lane.plannedLeft}
							<!-- The lane's head is drawn like its card in the Funding Accounts wallet:
							     graphite, with the headline figure on it. The headline is Expected at end;
							     a Cut-off already over has none, so Planned left leads there. -->
							<div
								class="relative -mx-3 -mt-3 mb-3 overflow-hidden rounded-t-xl p-3"
								style="color:#f3f1ec;background:linear-gradient(155deg,#34332f 0%,#232321 60%,#191918 100%)"
							>
								<div
									class="pointer-events-none absolute inset-0"
									style="background:linear-gradient(115deg, transparent 45%, rgb(255 255 255 / 0.05) 55%, transparent 65%)"
								></div>
								<!-- Drag the header (or arrow keys on it) to reorder the Funding Accounts. -->
								<h2
									class="relative flex cursor-grab items-center gap-1 font-medium"
									draggable="true"
									ondragstart={(e) => {
										e.stopPropagation();
										laneDrag = lane.accountId;
									}}
									ondragend={() => ((laneDrag = null), (laneAt = null))}
								>
									<button
										class="cursor-grab rounded px-0.5 opacity-40 hover:bg-white/10 hover:opacity-80"
										aria-label="Move {name(lane.accountId)} (arrow keys)"
										title="Drag to reorder, or use the arrow keys"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => laneKey(e, lane.accountId)}>⠿</button
									><span class="min-w-0 flex-1 truncate"
										>{ledger.chart.account(lane.accountId)?.name ?? name(lane.accountId)}</span
									><PesoMark size={14} class="shrink-0 opacity-40" />
								</h2>
								<p class="relative truncate text-[11px] opacity-60">
									{groupOf(lane.accountId)} · Balance today {formatAmount(lane.balanceToday)}
								</p>
								<div class="relative mt-3">
									<div
										class="text-[11px] opacity-60"
										title={atEnd !== undefined
											? 'Balance today plus what is still to receive, minus what is still to pay, through the end of this Cut-off'
											: undefined}
									>
										{atEnd !== undefined ? 'Expected at end' : 'Planned left'}
									</div>
									<div
										class="text-2xl font-semibold tabular-nums"
										style:color={headline < 0 ? '#fca5a5' : undefined}
									>
										{formatAmount(headline)}
									</div>
									<div class="text-[11px] opacity-60">
										in {formatAmount(lane.inn)} − out {formatAmount(lane.forecastedExp)} · left now
										{formatAmount(lane.left)}
									</div>
									{#if lane.forecastedEAlloc}<div class="text-[11px] opacity-60">
											E.Alloc {formatAmount(lane.eAlloc)} of {formatAmount(lane.forecastedEAlloc)}
										</div>{/if}
									{#if atEnd !== undefined}
										<div
											class="mt-2 flex justify-between border-t pt-2 text-[11px]"
											style="border-color:rgb(255 255 255 / 0.1)"
										>
											<span class="opacity-60">Planned left</span>
											<span
												class="font-medium tabular-nums"
												style:color={lane.plannedLeft < 0 ? '#fca5a5' : undefined}
												>{formatAmount(lane.plannedLeft)}</span
											>
										</div>
									{/if}
								</div>
							</div>
						{:else}
							<h2 class="font-semibold">{name(lane.accountId)}</h2>
							<p class="text-xs text-gray-500">Balance today {formatAmount(lane.balanceToday)}</p>
							<button
								class="mt-2 rounded border px-2 py-0.5 text-xs"
								onclick={() => saveFunding([...view.fundingAccounts, lane.accountId])}
								>Use as Funding Account</button
							>
						{/if}

						<h3 class="mt-2 text-xs font-medium text-gray-500 uppercase">In</h3>
						{#each lane.inflows as i (i.key)}
							<div class="flex justify-between gap-2 text-sm">
								<span
									>{i.label}{#if i.late}<span
											class="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">Late</span
										>{/if}
									<span class="block text-xs text-gray-500"
										>{#if i.paidBy.length}<a
												class="underline"
												href={resolve('/transactions/[id]', { id: i.paidBy.at(-1) ?? '' })}
												>received {day(i.receivedOn ?? i.date)}</a
											>{:else}expected {day(i.due)}{/if}{#if i.status !== 'paid'}
											· <button class="underline" onclick={() => recordInflow(i.plan.id, i.due)}
												>Record</button
											>{/if}</span
									></span
								>
								<span class="tabular-nums {i.status === 'paid' ? 'text-emerald-700' : ''}"
									>{i.varies && !i.received ? 'varies' : formatAmount(i.total)}</span
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
									.filter((s) => s.accountId === lane.accountId && s.valid && s.amount > 0)
									.filter(() => !onlyKey || o.key === onlyKey)
									.map((s) => ({ o, s }))) as { o, s }, k (o.key + k)}
								{@render card(
									o,
									s.accountId,
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
		{/if}
	</main>

	{#if managing && view}
		<Drawer label="Funding Accounts" onclose={() => (managing = false)}>
			<FundingWallet
				items={walletItems}
				bind:picked
				title="Funding Accounts for {shortDate(cutoff)}"
				error={fundingError}
				onsave={() => saveFunding(picked)}
				oncancel={() => (managing = false)}
			/>
		</Drawer>
	{:else if allocating && view}
		<Drawer label="Allocate early" onclose={() => (allocating = false)}>
			<AllocatePanel
				{input}
				{cutoff}
				lanes={view.lanes}
				{name}
				onclose={() => (allocating = false)}
			/>
		</Drawer>
	{:else if adding && view}
		<Drawer label="Add to the Forecast" onclose={() => (adding = null)}>
			{#key adding}
				<ForecastAddPanel
					kind={adding}
					{input}
					{cutoff}
					lanes={view.lanes}
					{name}
					onclose={() => (adding = null)}
				/>
			{/key}
		</Drawer>
	{:else if open && view}
		<Drawer label="Outflow" onclose={() => (openKey = null)}>
			<ForecastDrawer
				outflow={open}
				{cutoff}
				{input}
				lanes={view.lanes}
				{name}
				onclose={() => (openKey = null)}
			/>
		</Drawer>
	{/if}
</div>

<svelte:window
	onkeydown={(e) => {
		const t = e.target as HTMLElement;
		if (t.closest('input, textarea, select, [contenteditable]')) return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected) copied = selected;
		// An open drawer or dialog takes the first Esc (overlays.svelte.ts).
		if (e.key === 'Escape' && !e.defaultPrevented) {
			selected = null;
			openKey = null;
			adding = null;
			copied = null;
			menu = null;
			paste = null;
		}
	}}
	onclick={() => (menu = null)}
/>

{#if menu}
	{@const mo = outflowOf(menu.ref.key)}
	{#if mo}
		<div
			class="fixed z-50 w-64 rounded-lg border bg-white py-1 text-sm shadow-xl"
			style="left: {menu.x}px; top: {menu.y}px"
			role="menu"
		>
			<p class="px-3 py-1 text-xs text-gray-500">{mo.label}</p>
			<button
				class="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
				onclick={() => ((onlyKey = mo.key), (menu = null))}>Show in all Funding Accounts</button
			>
			<button
				class="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
				onclick={() => ((openKey = mo.key), (adding = null), (menu = null))}>Open</button
			>
			<button
				class="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
				onclick={() => ((selected = copied = menu!.ref), (menu = null))}
				>Copy to another Funding Account <span class="float-right text-xs text-gray-400"
					>Ctrl+C</span
				></button
			>
			{#if recordPicks(mo, 'all').length}
				<button
					class="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
					onclick={() => recordAll(mo)}>Record all</button
				>
			{/if}
			<a class="block w-full px-3 py-1.5 text-left hover:bg-gray-100" href={planHref(mo)}
				>Open plan ↗</a
			>
		</div>
	{/if}
{/if}

{#if paste}
	{@const po = outflowOf(paste.ref.key)}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
		<form
			class="w-80 rounded-xl bg-white p-4 text-sm shadow-2xl"
			onsubmit={(e) => {
				e.preventDefault();
				confirmPaste();
			}}
		>
			<h2 class="font-semibold">Add a Paying source</h2>
			<p class="text-gray-500">
				{po?.label} from <b>{name(paste.lane)}</b>{paste.ref.from
					? `, moved out of ${name(paste.ref.from)}`
					: ''}.
			</p>
			<label class="mt-3 block"
				>Amount <input
					class="mt-1 w-full rounded border-gray-300 py-1"
					inputmode="decimal"
					bind:value={paste.amount}
				/></label
			>
			<div class="mt-3 flex justify-end gap-2">
				<button
					type="button"
					class="rounded border px-3 py-1"
					onclick={() => ((paste = null), (copied = null))}>Cancel</button
				>
				<button class="rounded bg-gray-900 px-3 py-1 text-white">Add</button>
			</div>
		</form>
	</div>
{/if}
