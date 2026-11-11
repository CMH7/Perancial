<script lang="ts">
	// Record a new Transaction. `?copy=<id>` starts from a duplicate of that Transaction;
	// `?plan=<id>&due=<date>` records that Scheduled Transaction occurrence (Record), linked to it;
	// `?takeOn=<installmentId>&variant=purchase|move-debt|card-payment[&to=<id>]` prefills taking on
	// an Installment Plan (never linked); `?installment=<id>&due=<date>` records that row, linked.
	// From the Forecast, `&sources=<account:centavos,…>` pays those Paying sources and
	// `&back=/forecast?…` returns there after saving. Recording a Liability payment also offers
	// its unpaid planned charges, recorded with it on their own dates.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import TransactionForm from '#lib/components/TransactionForm.svelte';
	import {
		addDays,
		duplicateDraft,
		emptyDraft,
		formatAmount,
		forecastRecordDraft,
		installmentRecordDraft,
		occurrencesOf,
		occurrenceStatus,
		parseAmount,
		parsePicks,
		plannedCharges,
		planRecordCharges,
		recordDraft,
		shortDate,
		takeOnDraft,
		today,
		type PaidLink,
		type TakeOn
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

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
	const recordingRow = $derived.by(() => {
		const plan = ledger.installments.find((p) => p.id === params.get('installment'));
		const due = params.get('due');
		const row = plan?.rows.find((r) => r.due === due);
		if (!plan || !row) return undefined;
		const draft = installmentRecordDraft(ledger.chart, plan, row.due, { today: todayIso });
		const pays: PaidLink = { plan: 'installment', planId: plan.id, due: row.due };
		return { plan, row, draft, pays };
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
	/** Paying sources picked on the Forecast, and where to go back to. */
	const picks = $derived(parsePicks(params.get('sources') ?? ''));
	const back = $derived.by(() => {
		const b = params.get('back') ?? '';
		return b.startsWith('/forecast') ? b : null;
	});
	const fromForecast = (draft: ReturnType<typeof emptyDraft>) =>
		picks.length ? forecastRecordDraft(draft, picks) : draft;

	// Recording a Liability payment: its planned charges not yet recorded, ticked by default.
	const charges = $derived.by(() => {
		if (!recording) return [];
		const { chart } = ledger;
		const occ = recording.view.occurrence;
		const liability = occ.version.lines.find(
			(l) => l.side === 'to' && !l.fee && chart.account(l.accountId)?.type === 'liability'
		);
		if (!liability) return [];
		const input = { chart, scheduled: ledger.scheduled, installments: ledger.installments };
		return plannedCharges(input, liability.accountId, occ.date, { today: todayIso });
	});
	const amountText = (c: number | null) =>
		c === null ? '' : `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
	const ticked = new SvelteSet<string>();
	const amounts = new SvelteMap<string, string>();
	let chargesFor = $state('');
	$effect(() => {
		const key = charges.map((c) => c.key).join('|');
		if (key === chargesFor) return;
		chargesFor = key;
		ticked.clear();
		amounts.clear();
		for (const c of charges) {
			amounts.set(c.key, amountText(c.amount));
			if (c.blocked !== 'later' && c.amount !== null) ticked.add(c.key);
		}
	});
	const centsOf = (key: string) => {
		const cents = parseAmount(amounts.get(key) ?? '');
		return cents !== null && cents > 0 ? cents : null;
	};
	const chosen = $derived(charges.filter((c) => ticked.has(c.key) && c.blocked !== 'later'));
	const chargesBlocked = $derived(chosen.some((c) => centsOf(c.key) === null));
	const chargeWrites = ({ now, today }: { now: Date; today: string }) =>
		planRecordCharges(
			ledger.chart,
			chosen.map((charge) => ({
				charge,
				amount: centsOf(charge.key)!,
				id: ledger.newTransactionId()
			})),
			{ now, today }
		);

	// The form copies this once when it mounts, so later changes don't reset what the user typed.
	const initial = $derived(
		round === 0 && recording
			? fromForecast(recordDraft(recording.view, { today: todayIso }))
			: round === 0 && recordingRow
				? fromForecast(recordingRow.draft)
				: round === 0 && takingOn
					? takingOn.draft
					: round === 0 && source
						? duplicateDraft(source, { today: todayIso })
						: emptyDraft({ today: todayIso })
	);
</script>

{#snippet plannedSection()}
	<section class="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
		<h2 class="mb-1 text-xs font-semibold text-gray-600 uppercase">
			Also record planned charges ({chosen.length} of {charges.length})
		</h2>
		<p class="mb-2 text-xs text-gray-500">
			Each is recorded on its own date and pays its plan, saved together with this payment.
		</p>
		{#each charges as c (c.key)}
			<div class="flex flex-wrap items-center gap-2 border-b border-sky-100 py-1">
				<input
					type="checkbox"
					aria-label="Record {c.label}"
					disabled={c.blocked === 'later'}
					checked={ticked.has(c.key)}
					onchange={() => (ticked.has(c.key) ? ticked.delete(c.key) : ticked.add(c.key))}
				/>
				<span class="flex-1">
					{c.label}
					<span class="text-xs text-gray-500">planned {shortDate(c.date, { year: false })}</span>
					{#if c.blocked === 'later'}<span class="text-xs text-amber-700">
							· not yet: dated after today</span
						>{/if}
				</span>
				<input
					value={amounts.get(c.key) ?? ''}
					oninput={(e) => amounts.set(c.key, e.currentTarget.value)}
					disabled={c.blocked === 'later' || !ticked.has(c.key)}
					placeholder={c.amount === null ? 'Amount' : formatAmount(c.amount).replace('₱', '')}
					aria-label="Amount for {c.label}"
					class="w-28 rounded border-gray-300 py-0.5 text-right text-sm tabular-nums"
				/>
				{#if ticked.has(c.key) && c.blocked !== 'later' && centsOf(c.key) === null}
					<span class="w-full text-right text-xs text-red-600">Enter an amount like 1,234.50</span>
				{/if}
			</div>
		{/each}
	</section>
{/snippet}

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
		{#if recordingRow && round === 0}
			<p class="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
				Recording {recordingRow.plan.title} #{recordingRow.row.n}, due {shortDate(
					recordingRow.row.date
				)}. Change anything before saving.
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
				pays={round === 0 ? (recording?.pays ?? recordingRow?.pays) : undefined}
				extra={round === 0 && charges.length ? plannedSection : undefined}
				extraWrites={round === 0 && charges.length ? chargeWrites : undefined}
				extraBlocked={round === 0 && chargesBlocked}
				onsaved={(id) => {
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- checked /forecast path
					if (back && round === 0 && (recording || recordingRow)) return goto(back);
					if (recording && round === 0) return goto(resolve('/scheduled'));
					if (recordingRow && round === 0)
						return goto(resolve('/installments/[id]', { id: recordingRow.plan.id }));
					savedId = id;
					round++;
				}}
			/>
		{/key}
	{/if}
</main>
