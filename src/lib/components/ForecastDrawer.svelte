<script lang="ts">
	// One Outflow of a Forecast in a right-hand panel, like the Journal's Transaction panel: its
	// Section, due date, status, charges and Paying sources, with Record (all, or one source) through
	// the existing Record flow, and a link to its plan.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		formatAmount,
		formatPicks,
		laterPayments,
		parseAmount,
		planBillLater,
		planBillWithPayment,
		planSetSources,
		planUndoAllocation,
		recordPicks,
		shortDate,
		sourceEditErrors,
		type Charge,
		type ForecastInput,
		type ForecastOutflow,
		type Lane
	} from '#lib/domain/index.ts';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from './AccountPicker.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		outflow: o,
		cutoff,
		input,
		lanes,
		name,
		onclose
	}: {
		outflow: ForecastOutflow;
		cutoff: string;
		input: ForecastInput;
		lanes: Lane[];
		name: (id: string) => string;
		onclose: () => void;
	} = $props();

	// Editing the Paying sources: amounts as typed text, saved on the Occurrence or Row.
	type Row = { accountId: string; amount: string; paid: number };
	const text = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
	const fromOutflow = (): Row[] =>
		o.sources
			.filter((s) => s.amount > 0 || s.paid > 0)
			.map((s) => ({ accountId: s.accountId, amount: text(s.amount), paid: s.paid }));
	let rows = $state<Row[]>([]);
	let editedKey = $state('');
	// Start over whenever another Outflow opens or the saved sources change.
	const savedKey = $derived(`${o.key}|${JSON.stringify(o.sources)}`);
	$effect(() => {
		if (savedKey !== editedKey) {
			rows = fromOutflow();
			editedKey = savedKey;
		}
	});
	const cents = (t: string) => parseAmount(t) ?? NaN;
	const typed = $derived(rows.map((r) => ({ accountId: r.accountId, amount: cents(r.amount) })));
	const errors = $derived(
		new Map(sourceEditErrors(input, cutoff, typed).map((e) => [e.at, e.message]))
	);
	const dirty = $derived(JSON.stringify(rows) !== JSON.stringify(fromOutflow()));
	const covered = $derived(typed.reduce((t, s) => t + (Number.isNaN(s.amount) ? 0 : s.amount), 0));
	const fundingLanes = $derived(lanes.filter((l) => l.funding));
	let saveError = $state('');
	let saving = $state(false);
	function addSource(accountId: string) {
		if (!accountId) return;
		rows.push({ accountId, amount: text(Math.max(0, o.total - covered)), paid: 0 });
	}
	// "Bill with next payment": the charge moves to the following payment of this Liability.
	let billError = $state('');
	async function billLater(c: Charge) {
		billError = '';
		try {
			await ledger.commit(planBillLater(input, c, o.date, new Date()));
		} catch (err) {
			billError = (err as Error).message;
		}
	}

	// Moving several charges at once to a chosen later payment of this Liability.
	const picked = new SvelteSet<string>();
	let pickedFor = $state('');
	$effect(() => {
		if (pickedFor !== o.key) {
			picked.clear();
			pickedFor = o.key;
		}
	});
	const targets = $derived(
		o.liabilityId ? laterPayments(input, o.liabilityId, o.date).slice(0, 12) : []
	);
	let target = $state<string | undefined>();
	const allPicked = $derived(!!o.charges?.length && o.charges.every((c) => picked.has(c.key)));
	function pickAll() {
		if (allPicked) picked.clear();
		else for (const c of o.charges ?? []) picked.add(c.key);
	}
	let moving = $state(false);
	async function moveSelected() {
		const to = target && targets.includes(target) ? target : targets[0];
		if (!o.liabilityId || !to) return;
		billError = '';
		moving = true;
		try {
			const chosen = (o.charges ?? []).filter((c) => picked.has(c.key));
			await ledger.commit(planBillWithPayment(input, chosen, o.liabilityId, to, new Date()));
			picked.clear();
		} catch (err) {
			billError = (err as Error).message;
		} finally {
			moving = false;
		}
	}

	// Undo an Early allocation, from the transfer or from its target.
	const transfer = $derived(
		o.ealloc
			? input.scheduled.find((p) => p.id === o.link.planId)
			: input.scheduled.find(
					(p) =>
						p.allocates && `${p.allocates.plan}:${p.allocates.planId}:${p.allocates.due}` === o.key
				)
	);
	let undoError = $state('');
	async function undo() {
		undoError = '';
		try {
			if (transfer) await ledger.commit(planUndoAllocation(input, transfer, new Date()));
			if (o.ealloc) onclose();
		} catch (err) {
			undoError = (err as Error).message;
		}
	}

	async function saveSources() {
		saveError = '';
		saving = true;
		try {
			await ledger.commit(planSetSources(input, cutoff, o, typed, new Date()));
		} catch (err) {
			saveError = (err as Error).message;
		} finally {
			saving = false;
		}
	}

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
	{#if transfer}
		<p class="text-xs">
			<button class="underline" onclick={undo}>Undo allocation</button>
			{#if undoError}<span class="block text-red-600">{undoError}</span>{/if}
		</p>
	{/if}
	{#if o.carried === 'in'}<p class="text-xs text-amber-700">Carried over: still unpaid.</p>{/if}
	{#if o.carried && o.carried !== 'in'}<p class="text-xs text-gray-500">
			Carried to the {shortDate(o.carried)} Forecast; this one keeps only what was paid.
		</p>{/if}

	{#if o.charges}
		<div>
			<p class="mb-1 flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase">
				{#if o.charges.length && targets.length}<input
						type="checkbox"
						aria-label="Select all charges"
						checked={allPicked}
						onchange={pickAll}
					/>{/if}
				Charges on {o.liabilityId ? name(o.liabilityId) : 'this Liability'}
			</p>
			{#if picked.size && targets.length}
				<div class="mb-1 flex flex-wrap items-center gap-2 rounded bg-gray-50 p-2 text-xs">
					<span>Move {picked.size} to the payment on</span>
					<select bind:value={target} class="rounded border-gray-300 py-0.5 text-xs">
						{#each targets as d (d)}<option value={d}>{shortDate(d)}</option>{/each}
					</select>
					<button
						class="rounded bg-gray-800 px-2 py-0.5 text-white disabled:opacity-50"
						disabled={moving}
						onclick={moveSelected}>Move</button
					>
					<button class="text-gray-500 underline" onclick={() => picked.clear()}>Clear</button>
				</div>
			{/if}
			{#each o.charges as c (c.key)}
				<div class="flex justify-between gap-2 border-b py-1">
					<span class="flex items-start gap-2"
						>{#if targets.length}<input
								type="checkbox"
								class="mt-1"
								aria-label="Select {c.label}"
								checked={picked.has(c.key)}
								onchange={() => (picked.has(c.key) ? picked.delete(c.key) : picked.add(c.key))}
							/>{/if}<span
							><a
								href={c.from === 'transaction'
									? resolve('/transactions/[id]', { id: c.txId ?? '' })
									: c.from === 'scheduled'
										? resolve('/scheduled/[id]', { id: c.link?.planId ?? '' })
										: resolve('/installments/[id]', { id: c.link?.planId ?? '' })}
								class="hover:underline"
								title={c.from === 'transaction' ? 'Open this Transaction' : 'Open its plan'}
								>{c.label}</a
							>
							<span class="text-xs text-gray-500"
								>{c.from === 'transaction' ? 'recorded' : 'planned'}
								{shortDate(c.purchased ?? c.date, {
									year: (c.purchased ?? c.date).slice(0, 4) !== o.date.slice(0, 4)
								})}</span
							></span
						></span
					>
					<span class="flex items-center gap-2">
						<span class="tabular-nums">{formatAmount(c.amount)}</span>
						<button
							class="text-xs text-gray-500 underline"
							title="Bill it with the following payment instead"
							onclick={() => billLater(c)}>Bill with next payment</button
						>
					</span>
				</div>
			{:else}<p class="text-xs text-gray-400">No charges since the last payment.</p>{/each}
			{#if billError}<p class="text-xs text-red-600">{billError}</p>{/if}
		</div>
	{/if}

	<div>
		<p class="mb-1 text-xs font-semibold text-gray-500 uppercase">Paying sources</p>
		{#each rows as r, i (i)}
			{@const saved = o.sources.find((s) => s.accountId === r.accountId)}
			<div class="py-1">
				<div class="flex items-center gap-1">
					{#if r.paid > 0}
						<span class="min-w-0 flex-1 truncate text-xs">{name(r.accountId)}</span>
					{:else}
						<AccountPicker
							bind:value={r.accountId}
							items={accountItems.for([
								...fundingLanes.map((l) => l.accountId),
								...(fundingLanes.some((l) => l.accountId === r.accountId) ? [] : [r.accountId])
							])}
							label="Paying source Account"
							note={(id) => {
								const l = fundingLanes.find((x) => x.accountId === id);
								return l ? `left ${formatAmount(l.plannedLeft)}` : 'not funding';
							}}
							class="flex-1 py-0.5 text-xs"
						/>
					{/if}
					<input
						class="w-24 rounded border-gray-300 py-0.5 text-right text-xs tabular-nums"
						bind:value={r.amount}
						inputmode="decimal"
						aria-label="Amount from {name(r.accountId)}"
					/>
					{#if saved && saved.amount > 0 && saved.paid >= saved.amount}
						<span class="text-xs text-emerald-700">Paid</span>
					{:else if saved?.valid && !dirty}
						<button class="text-xs underline" onclick={() => record(r.accountId)}>Record</button>
					{/if}
					{#if r.paid === 0}
						<button
							class="px-1 text-gray-400 hover:text-red-700"
							aria-label="Remove {name(r.accountId)}"
							onclick={() => rows.splice(i, 1)}>✕</button
						>
					{/if}
				</div>
				{#if errors.get(`sources.${i}.account`) || errors.get(`sources.${i}.amount`)}
					<p class="text-xs text-red-600">
						{errors.get(`sources.${i}.account`) ?? errors.get(`sources.${i}.amount`)}
					</p>
				{:else if r.paid > 0}
					<p class="text-xs text-gray-500">{formatAmount(r.paid)} paid; the Account stays.</p>
				{/if}
			</div>
		{:else}<p class="text-xs text-gray-400">No Paying source yet.</p>{/each}
		<div class="mt-2 flex items-center gap-2">
			<select
				class="rounded border-gray-300 py-0.5 text-xs"
				aria-label="Add a paying source"
				value=""
				onchange={(e) => {
					addSource(e.currentTarget.value);
					e.currentTarget.value = '';
				}}
			>
				<option value="">+ Add paying source…</option>
				{#each fundingLanes.filter((l) => !rows.some((r) => r.accountId === l.accountId)) as l (l.accountId)}
					<option value={l.accountId}
						>{name(l.accountId)} — left {formatAmount(l.plannedLeft)}</option
					>
				{/each}
			</select>
			<span class="text-xs text-gray-500"
				>sources {formatAmount(covered)} of {formatAmount(o.total)}</span
			>
		</div>
		{#if dirty}
			<div class="mt-2 flex items-center gap-2">
				<button
					class="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-40"
					disabled={saving || errors.size > 0}
					onclick={saveSources}>{saving ? 'Saving…' : 'Save sources'}</button
				>
				<button class="text-xs underline" onclick={() => (rows = fromOutflow())}>Discard</button>
				{#if saveError}<span class="text-xs text-red-600">{saveError}</span>{/if}
			</div>
		{/if}
		{#if o.unfunded && !dirty}<p class="mt-1 text-amber-700">
				Unfunded {formatAmount(o.unfunded)}
			</p>{/if}
		{#if o.usualAccounts.length}<p class="text-xs text-gray-500">
				Usually paid from {o.usualAccounts.map(name).join(', ')}.
			</p>{/if}
	</div>

	<div class="flex flex-wrap gap-2">
		{#if all.length && !dirty}
			<button class="rounded bg-gray-900 px-3 py-1.5 text-white" onclick={() => record('all')}
				>Record all</button
			>
		{/if}
		<a class="rounded border px-3 py-1.5" href={planHref}>Open plan ↗</a>
	</div>
</aside>
