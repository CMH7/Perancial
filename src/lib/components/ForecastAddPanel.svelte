<script lang="ts">
	// "+ Outflow" / "+ Inflow" on the Forecast: a one-off (a Scheduled Transaction that happens
	// once) or a repeating plan (the Scheduled plan editor). Installment Plans are made on their page.
	import { resolve } from '$app/paths';
	import {
		cutoffOf,
		evaluatePlanDraft,
		fundedWindow,
		fundingCutoffOf,
		oneOffDraft,
		planCreatePlan,
		shortDate,
		type ForecastInput,
		type Lane,
		type PlanDraft
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import PlanEditor from './PlanEditor.svelte';
	import SectionPicker from './SectionPicker.svelte';

	let {
		kind,
		input,
		cutoff,
		lanes,
		name,
		onclose
	}: {
		kind: 'outflow' | 'inflow';
		input: ForecastInput;
		cutoff: string;
		lanes: Lane[];
		name: (id: string) => string;
		onclose: () => void;
	} = $props();

	let mode = $state<'once' | 'repeat'>('once');
	const funding = $derived(lanes.filter((l) => l.funding).map((l) => l.accountId));
	const leaves = (types: string[]) =>
		input.chart
			.all()
			.filter(
				(a) => types.includes(a.type) && !a.system && !a.archived && !input.chart.isGroup(a.id)
			)
			.map((a) => ({ id: a.id, label: name(a.id) }))
			.sort((a, b) => a.label.localeCompare(b.label));
	// An Outflow is paid from a Funding Account to anything; an Inflow lands in an Asset from
	// Income, a Liability, or an Asset tracking what someone owes.
	const mineOptions = $derived(
		kind === 'outflow' ? funding.map((id) => ({ id, label: name(id) })) : leaves(['asset'])
	);
	const otherOptions = $derived(
		kind === 'outflow'
			? leaves(['expense', 'liability', 'asset'])
			: leaves(['income', 'liability', 'asset'])
	);

	// svelte-ignore state_referenced_locally
	let f = $state({
		description: '',
		date: kind === 'outflow' ? fundedWindow(cutoff).from : cutoff,
		amount: '',
		accountId: '',
		otherId: '',
		section: null as string | null
	});
	const draft = $derived(oneOffDraft({ kind, ...f }));
	const errors = $derived(evaluatePlanDraft(input.chart, draft).errors);
	let tried = $state(false);
	let saveError = $state('');
	let saving = $state(false);
	const landsIn = $derived(
		/^\d{4}-\d{2}-\d{2}$/.test(f.date)
			? kind === 'outflow'
				? `funded by the ${shortDate(fundingCutoffOf(f.date))} Cut-off`
				: `counts in the ${shortDate(cutoffOf(f.date))} Cut-off`
			: ''
	);

	async function save(d: PlanDraft) {
		saveError = '';
		saving = true;
		try {
			await ledger.commit(
				planCreatePlan(input.chart, d, { id: ledger.newScheduledId(), now: new Date() })
			);
			onclose();
		} catch (err) {
			saveError = (err as Error).message;
		} finally {
			saving = false;
		}
	}
	function saveOnce(e: SubmitEvent) {
		e.preventDefault();
		tried = true;
		if (!errors.length) save(draft);
	}
	const field = 'mt-1 w-full rounded border-gray-300 py-1 text-sm';
	const repeatInitial = $derived<PlanDraft>({
		...draft,
		rule: { type: 'monthly', day: Number(f.date.slice(8)) || 1, start: f.date }
	});
</script>

<aside class="space-y-3 text-sm" aria-label="New {kind === 'outflow' ? 'Outflow' : 'Inflow'}">
	<div class="flex items-start justify-between">
		<h2 class="text-lg font-semibold">New {kind === 'outflow' ? 'Outflow' : 'Inflow'}</h2>
		<button onclick={onclose} class="text-gray-400 hover:text-gray-900" aria-label="Close">✕</button
		>
	</div>
	<div class="flex gap-1 border-b">
		{#each [['once', 'One-off'], ['repeat', 'Repeating']] as const as [k, label] (k)}
			<button
				class="-mb-px border-b-2 px-3 py-1.5 {mode === k
					? 'border-gray-900 font-medium'
					: 'border-transparent text-gray-500'}"
				onclick={() => (mode = k)}>{label}</button
			>
		{/each}
	</div>

	{#if mode === 'once'}
		<form class="space-y-2" onsubmit={saveOnce} novalidate>
			<p class="text-xs text-gray-500">Saved as a Scheduled Transaction that happens once.</p>
			<label class="block"
				>Description <input class={field} bind:value={f.description} maxlength="200" /></label
			>
			<label class="block"
				>{kind === 'outflow' ? 'Due' : 'Expected'}
				<input type="date" class={field} bind:value={f.date} />
				{#if landsIn}<span class="text-xs text-gray-500">{landsIn}</span>{/if}
			</label>
			<label class="block"
				>Amount <input class={field} bind:value={f.amount} inputmode="decimal" /></label
			>
			<label class="block"
				>{kind === 'outflow' ? 'Paid from' : 'Lands in'}
				<select class={field} bind:value={f.accountId}>
					<option value="" disabled>Pick an Account</option>
					{#each mineOptions as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
				</select>
			</label>
			<label class="block"
				>{kind === 'outflow' ? 'To' : 'From'}
				<select class={field} bind:value={f.otherId}>
					<option value="" disabled>Pick an Account</option>
					{#each otherOptions.filter((o) => o.id !== f.accountId) as o (o.id)}<option value={o.id}
							>{o.label}</option
						>{/each}
				</select>
			</label>
			<SectionPicker value={f.section} onchange={(id) => (f.section = id)} />
			{#if tried && errors.length}<p class="text-red-600">{errors[0].message}</p>{/if}
			{#if saveError}<p class="text-red-600">{saveError}</p>{/if}
			<button
				class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40"
				disabled={saving}>{saving ? 'Saving…' : 'Save'}</button
			>
		</form>
	{:else}
		{#key mode}
			<PlanEditor
				initial={repeatInitial}
				heading="New repeating plan"
				submitLabel="Create plan"
				onsubmit={save}
			/>
		{/key}
	{/if}

	{#if kind === 'outflow'}
		<p class="border-t pt-2 text-xs text-gray-500">
			An Installment Plan? <a class="underline" href={resolve('/installments/new')}
				>Make it on the Installments page ↗</a
			>
		</p>
	{/if}
</aside>
