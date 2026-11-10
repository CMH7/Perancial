<script lang="ts">
	// Record a new Transaction. `?copy=<id>` starts from a duplicate of that Transaction;
	// `?plan=<id>&due=<date>` records that Scheduled Transaction occurrence (Record), linked to it;
	// `?takeOn=<installmentId>&variant=purchase|move-debt|card-payment[&to=<id>]` prefills taking on
	// an Installment Plan (never linked).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import TransactionForm from '#lib/components/TransactionForm.svelte';
	import {
		addDays,
		duplicateDraft,
		emptyDraft,
		occurrencesOf,
		occurrenceStatus,
		recordDraft,
		shortDate,
		takeOnDraft,
		today,
		type PaidLink,
		type TakeOn
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	/** Bumped after each save so the form starts over. */
	let round = $state(0);
	let savedId = $state<string | null>(null);
	const todayIso = today();
	const params = $derived(page.url.searchParams);

	const source = $derived(ledger.transactions.find((t) => t.id === params.get('copy')));
	const recording = $derived.by(() => {
		const plan = ledger.scheduled.find((p) => p.id === params.get('plan'));
		const due = params.get('due');
		if (!plan || !due) return undefined;
		const occurrence = occurrencesOf(plan, {
			from: addDays(due, -400),
			to: addDays(due, 400)
		}).find((o) => o.due === due);
		if (!occurrence) return undefined;
		const view = {
			plan,
			occurrence,
			status: occurrenceStatus(ledger.chart, occurrence, { today: todayIso })
		};
		const pays: PaidLink = { plan: 'scheduled', planId: plan.id, due };
		return { view, pays };
	});
	const takingOn = $derived.by(() => {
		const plan = ledger.installments.find((p) => p.id === params.get('takeOn'));
		const variant = params.get('variant') as TakeOn | null;
		if (!plan || !variant || !['purchase', 'move-debt', 'card-payment'].includes(variant))
			return undefined;
		return {
			plan,
			draft: takeOnDraft(plan, variant, { today: todayIso, to: params.get('to') ?? '' })
		};
	});
	// The form copies this once when it mounts, so later changes don't reset what the user typed.
	const initial = $derived(
		round === 0 && recording
			? recordDraft(recording.view, { today: todayIso })
			: round === 0 && takingOn
				? takingOn.draft
				: round === 0 && source
					? duplicateDraft(source, { today: todayIso })
					: emptyDraft({ today: todayIso })
	);
</script>

<main class="mx-auto max-w-4xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else}
		{#if savedId}
			<p class="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
				Saved. <a class="underline" href={resolve('/transactions/[id]', { id: savedId })}>Open it</a
				> or record another below.
			</p>
		{/if}
		{#if recording && round === 0}
			<p class="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
				Recording {recording.view.occurrence.version.description}, due {shortDate(
					recording.view.occurrence.due
				)}{#if recording.view.status.status === 'partly-paid'}: only what is left{/if}. Change
				anything before saving.
			</p>
		{/if}
		{#if takingOn && round === 0}
			<p class="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
				Taking on {takingOn.plan.title}. Optional: change anything, or leave without saving.
			</p>
		{/if}
		{#key round}
			<TransactionForm
				{initial}
				pays={round === 0 ? recording?.pays : undefined}
				onsaved={(id) => {
					if (recording && round === 0) return goto(resolve('/scheduled'));
					savedId = id;
					round++;
				}}
			/>
		{/key}
	{/if}
</main>
