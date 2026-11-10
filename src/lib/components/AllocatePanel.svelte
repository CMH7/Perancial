<script lang="ts">
	// "Allocate early": pick Outflows from later Cut-offs and fund them now, moving the money into
	// a reserve Account. One transfer per Outflow, whole Outflows only.
	import {
		allocationCandidates,
		formatAmount,
		fundingCandidates,
		lastReserve,
		planAllocateEarly,
		shortDate,
		type ChartWrite,
		type ForecastInput,
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

	let cutoffs = $state(1);
	const candidates = $derived(allocationCandidates(input, cutoff, { cutoffs }));
	let picked = $state<string[]>([]);
	const funding = $derived(lanes.filter((l) => l.funding));
	// svelte-ignore state_referenced_locally
	let fromId = $state(
		[...lanes].filter((l) => l.funding).sort((a, b) => b.plannedLeft - a.plannedLeft)[0]
			?.accountId ?? ''
	);
	const reserves = $derived(
		fundingCandidates(input.chart)
			.map((a) => ({ id: a.id, label: name(a.id) }))
			.sort((a, b) => a.label.localeCompare(b.label))
	);
	// svelte-ignore state_referenced_locally
	let reserveId = $state(lastReserve(input.scheduled) ?? '');
	let error = $state('');
	let busy = $state(false);
	const total = $derived(
		candidates.filter((o) => picked.includes(o.key)).reduce((s, o) => s + o.remaining, 0)
	);

	async function allocate() {
		error = '';
		busy = true;
		try {
			const writes: ChartWrite[] = [];
			let state = input;
			for (const o of candidates.filter((c) => picked.includes(c.key))) {
				const w = planAllocateEarly(state, {
					cutoff,
					target: o,
					reserveId,
					fromId,
					transferId: ledger.newScheduledId(),
					now: new Date()
				});
				writes.push(...w);
				// Later picks see the Funding Accounts this one added.
				const forecast = w.find((x) => x.op === 'setForecast');
				if (forecast && forecast.op === 'setForecast')
					state = {
						...state,
						forecasts: [
							...state.forecasts.filter((f) => f.id !== forecast.id),
							{ id: forecast.id, ...forecast.data }
						]
					};
			}
			await ledger.commit(writes);
			onclose();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="mb-3 max-w-2xl rounded-lg border bg-white p-3 text-sm">
	<p class="font-medium">Allocate early from the {shortDate(cutoff)} Cut-off</p>
	<p class="mb-2 text-xs text-gray-500">
		Each pick becomes a transfer into the reserve, dated on this Cut-off (or today, when later); the
		Outflow is then paid from the reserve.
	</p>
	<ul class="max-h-64 space-y-1 overflow-y-auto">
		{#each candidates as o (o.key)}
			<li>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						checked={picked.includes(o.key)}
						onchange={(e) =>
							(picked = e.currentTarget.checked
								? [...picked, o.key]
								: picked.filter((k) => k !== o.key))}
					/>
					<span class="flex-1"
						>{o.label} <span class="text-xs text-gray-500">due {shortDate(o.date)}</span></span
					>
					<span class="tabular-nums">{formatAmount(o.remaining)}</span>
				</label>
			</li>
		{:else}<li class="text-gray-500">
				Nothing to allocate in the next Cut-off{cutoffs > 1 ? 's' : ''}.
			</li>{/each}
	</ul>
	<button class="mt-1 text-xs underline" onclick={() => (cutoffs += 2)}>Look further ahead</button>

	<div class="mt-3 grid gap-2 sm:grid-cols-2">
		<label class="block"
			>Pay from
			<AccountPicker
				bind:value={fromId}
				items={accountItems.for(funding.map((l) => l.accountId))}
				label="Pay from"
				note={(id) => {
					const l = funding.find((x) => x.accountId === id);
					return l && `left ${formatAmount(l.plannedLeft)}`;
				}}
				class="mt-1 w-full text-xs"
			/>
		</label>
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
	</div>
	{#if error}<p class="mt-2 text-red-600">{error}</p>{/if}
	<div class="mt-3 flex items-center gap-2">
		<button
			class="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-40"
			disabled={busy || !picked.length || !reserveId || !fromId}
			onclick={allocate}>Allocate {formatAmount(total)}</button
		>
		<button class="rounded border px-3 py-1" onclick={onclose}>Cancel</button>
	</div>
</div>
