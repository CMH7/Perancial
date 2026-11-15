<script lang="ts">
	// "Allocate early": browse later Cut-offs one at a time (‹ › or the Cut-off picker), pick
	// Outflows from any of them, and fund them now from one or more Funding Accounts into a reserve.
	// One transfer per Outflow, whole Outflows only; picks are funded in date order.
	import {
		allocationCandidates,
		formatAmount,
		fundingCandidates,
		lastReserve,
		parseAmount,
		planAllocateMany,
		shortDate,
		upcomingCutoffs,
		type ForecastInput,
		type ForecastOutflow,
		type Lane
	} from '#lib/domain/index.ts';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from './AccountPicker.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';

	let {
		input,
		cutoff,
		lanes,
		name,
		onclose
	}: {
		input: ForecastInput;
		cutoff: string;
		lanes: Lane[];
		name: (id: string) => string;
		onclose: () => void;
	} = $props();

	const cutoffs = $derived(upcomingCutoffs(cutoff, 24));
	// svelte-ignore state_referenced_locally
	let target = $state(upcomingCutoffs(cutoff, 1)[0]);
	const at = $derived(cutoffs.indexOf(target));
	const candidates = $derived(allocationCandidates(input, cutoff, { target }));

	/** Picks from every Cut-off browsed, kept while moving between them. */
	let picked = $state<Record<string, { o: ForecastOutflow; cutoff: string }>>({});
	const picks = $derived(
		Object.values(picked)
			.map((p) => p.o)
			.toSorted((a, b) => a.date.localeCompare(b.date))
	);
	const total = $derived(picks.reduce((s, o) => s + o.remaining, 0));
	const pickedIn = (c: string) => Object.values(picked).filter((p) => p.cutoff === c).length;
	function toggle(o: ForecastOutflow, on: boolean) {
		const { [o.key]: _, ...rest } = picked;
		picked = on ? { ...picked, [o.key]: { o, cutoff: target } } : rest;
	}

	const funding = $derived(lanes.filter((l) => l.funding));
	const left = (id: string) => funding.find((l) => l.accountId === id)?.plannedLeft;
	/** Pay-from rows; a blank amount takes the rest. */
	// svelte-ignore state_referenced_locally
	let from = $state<{ accountId: string; amount: string }[]>([
		{
			accountId:
				[...lanes].filter((l) => l.funding).sort((a, b) => b.plannedLeft - a.plannedLeft)[0]
					?.accountId ?? '',
			amount: ''
		}
	]);
	const unused = $derived(funding.filter((l) => !from.some((f) => f.accountId === l.accountId)));
	const typed = $derived(from.reduce((s, f) => s + (parseAmount(f.amount) ?? 0), 0));

	const reserves = $derived(
		fundingCandidates(input.chart)
			.map((a) => ({ id: a.id, label: name(a.id) }))
			.sort((a, b) => a.label.localeCompare(b.label))
	);
	// svelte-ignore state_referenced_locally
	let reserveId = $state(lastReserve(input.scheduled) ?? '');
	let error = $state('');
	let busy = $state(false);

	async function allocate() {
		error = '';
		const amounts = from.map((f) => ({
			accountId: f.accountId,
			amount: f.amount.trim() ? parseAmount(f.amount) : null
		}));
		const bad = from.find((f) => f.amount.trim() && parseAmount(f.amount) === null);
		if (bad) {
			error = 'Enter amounts like 1,234.56';
			return;
		}
		busy = true;
		try {
			await ledger.commit(
				planAllocateMany(input, {
					cutoff,
					targets: picks,
					from: amounts,
					reserveId,
					newId: () => ledger.newScheduledId(),
					now: new Date()
				})
			);
			onclose();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-3 text-sm">
	<div>
		<h2 class="text-lg font-semibold">Allocate early from the {shortDate(cutoff)} Cut-off</h2>
		<p class="text-xs text-gray-500">
			Each pick becomes a transfer into the reserve, dated on this Cut-off (or today, when later);
			the Outflow is then paid from the reserve.
		</p>
	</div>

	<div class="flex items-center gap-1">
		<button
			class="rounded border px-2 py-1 disabled:opacity-30"
			aria-label="Previous Cut-off"
			disabled={at <= 0}
			onclick={() => (target = cutoffs[at - 1])}>‹</button
		>
		<select
			bind:value={target}
			aria-label="Cut-off to allocate for"
			class="flex-1 rounded border-gray-300 py-1 text-center text-sm font-medium"
		>
			{#each cutoffs as c (c)}
				{@const n = pickedIn(c)}
				<option value={c}>Cut-off {shortDate(c)}{n ? ` · ${n} picked` : ''}</option>
			{/each}
		</select>
		<button
			class="rounded border px-2 py-1 disabled:opacity-30"
			aria-label="Next Cut-off"
			disabled={at >= cutoffs.length - 1}
			onclick={() => (target = cutoffs[at + 1])}>›</button
		>
	</div>

	<ul class="space-y-1">
		{#each candidates as o (o.key)}
			<li>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						checked={!!picked[o.key]}
						onchange={(e) => toggle(o, e.currentTarget.checked)}
					/>
					<span class="flex-1"
						>{o.label} <span class="text-xs text-gray-500">due {shortDate(o.date)}</span></span
					>
					<span class="tabular-nums">{formatAmount(o.remaining)}</span>
				</label>
			</li>
		{:else}<li class="text-gray-500">Nothing to allocate in this Cut-off.</li>{/each}
	</ul>

	{#if picks.length}
		<p class="rounded bg-violet-50 px-2 py-1 text-xs text-violet-800">
			{picks.length} picked across Cut-offs · {formatAmount(total)}
		</p>
	{/if}

	<div class="space-y-1">
		<span class="block">Pay from</span>
		{#each from as row, i (i)}
			<div class="flex items-center gap-2">
				<AccountPicker
					bind:value={row.accountId}
					items={accountItems.for(
						funding
							.filter(
								(l) =>
									l.accountId === row.accountId || !from.some((f) => f.accountId === l.accountId)
							)
							.map((l) => l.accountId)
					)}
					label="Pay from"
					note={(id) => {
						const l = left(id);
						return l === undefined ? undefined : `left ${formatAmount(l)}`;
					}}
					class="min-w-0 flex-1 text-xs"
				/>
				<input
					bind:value={row.amount}
					aria-label="Amount from {name(row.accountId)}"
					placeholder={from.length > 1 ? 'the rest' : 'all'}
					class="w-28 rounded border-gray-300 py-1 text-right text-sm tabular-nums"
				/>
				{#if from.length > 1}
					<button
						class="text-gray-400 hover:text-red-600"
						aria-label="Remove {name(row.accountId)}"
						onclick={() => (from = from.filter((_, j) => j !== i))}>✕</button
					>
				{/if}
			</div>
		{/each}
		{#if unused.length}
			<button
				class="text-xs text-sky-700 underline"
				onclick={() => (from = [...from, { accountId: unused[0].accountId, amount: '' }])}
				>+ another Account</button
			>
		{/if}
		{#if from.length > 1 && picks.length}
			<p class="text-xs text-gray-500">
				Typed {formatAmount(typed)} of {formatAmount(total)}; leave one amount blank for the rest.
			</p>
		{/if}
	</div>

	<label class="block"
		>Into the reserve
		<AccountPicker
			bind:value={reserveId}
			items={accountItems.for(reserves.map((r) => r.id))}
			label="Into the reserve"
			placeholder="Pick an Account"
			class="mt-1 w-full text-xs"
		/>
	</label>

	{#if error}<p class="text-red-600">{error}</p>{/if}
	<div class="flex items-center gap-2">
		<button
			class="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-40"
			disabled={busy || !picks.length || !reserveId || from.some((f) => !f.accountId)}
			onclick={allocate}>Allocate {formatAmount(total)}</button
		>
		<button class="rounded border px-3 py-1" onclick={onclose}>Cancel</button>
	</div>
</div>
