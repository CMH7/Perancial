<script lang="ts">
	// A new Installment Plan. After saving, offers the take-on Transactions that apply, prefilled.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import InstallmentForm from '#lib/components/InstallmentForm.svelte';
	import {
		installmentDraftFromTransaction,
		planCreateInstallmentFromDraft,
		planMadeFrom,
		today,
		type InstallmentDraft,
		type TakeOn
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const todayIso = today();
	/** When the owner started Perancial: the day the first Account was made. */
	const startedOn = $derived.by(() => {
		const first = ledger.accounts.reduce<Date | null>(
			(min, a) => (!min || a.createdAt < min ? a.createdAt : min),
			null
		);
		if (!first) return todayIso;
		const p = (n: number) => String(n).padStart(2, '0');
		return `${first.getFullYear()}-${p(first.getMonth() + 1)}-${p(first.getDate())}`;
	});

	const blank: InstallmentDraft = {
		kind: 'lender',
		title: '',
		note: '',
		tags: [],
		purchaseDate: todayIso,
		firstDate: todayIso,
		repeat: 'monthly',
		everyWeeks: 2,
		count: 12,
		rowZero: false,
		entry: 'flat',
		amount: '',
		interest: '',
		varied: [],
		additionals: {},
		trackedFrom: null,
		liability: { mode: 'new', parentId: '', name: '', historyName: 'Card spending' },
		inCardBalance: true,
		repaidAssetId: '',
		payingId: '',
		interestId: '',
		feesId: ''
	};

	/** Started from a Transaction's "Make installment plan". */
	const fromTx = $derived(
		ledger.chart.transactions().find((t) => t.id === page.url.searchParams.get('fromTx'))
	);
	const madeAlready = $derived(fromTx && planMadeFrom(ledger.installments, fromTx.id));
	const initial = $derived(
		fromTx ? installmentDraftFromTransaction(ledger.chart, fromTx, blank) : blank
	);

	type Saved = {
		planId: string;
		title: string;
		offers: { variant: TakeOn; to?: string; label: string; hint: string }[];
		note?: string;
	};
	let saved = $state<Saved | null>(null);

	function takeOn(o: Saved['offers'][number]) {
		const to = o.to ? `&to=${encodeURIComponent(o.to)}` : '';
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/transactions/new')}?takeOn=${saved!.planId}&variant=${o.variant}${to}`);
	}
	let round = $state(0);

	async function create(draft: InstallmentDraft) {
		const chart = ledger.chart;
		const r = planCreateInstallmentFromDraft(chart, ledger.installments, draft, {
			today: todayIso,
			startedOn,
			now: new Date(),
			planId: ledger.newInstallmentId(),
			newId: () => ledger.newAccountId()
		});
		await ledger.commit(r.writes);
		const plan = r.writes.at(-1)!;
		if (plan.op !== 'setInstallment') return;
		const inProgress = plan.data.trackedFrom > plan.data.rows[0].n;
		const card = r.historyId ?? draft.payingId;
		const cardIsLiability = chart.account(card)?.type === 'liability';
		const offers: Saved['offers'] = [];
		let note: string | undefined;
		if (draft.madeFrom) {
			// The Transaction already records the purchase; only a card's debt may need moving.
			if (draft.kind === 'lender' && cardIsLiability)
				offers.push({
					variant: 'move-debt',
					to: card,
					label: 'Move the debt off the card',
					hint: 'Moves it from the card to this plan.'
				});
		} else if (draft.kind === 'internal')
			offers.push({
				variant: 'card-payment',
				label: 'Record the card payment',
				hint: 'The straight payment out of the repaid Asset.'
			});
		else if (inProgress && draft.inCardBalance && cardIsLiability)
			offers.push({
				variant: 'move-debt',
				to: card,
				label: 'Move what is left off the card',
				hint: "The card's Opening Balance already holds it."
			});
		else if (inProgress) {
			if (draft.liability.mode === 'new' && !draft.inCardBalance)
				note = 'Its Liability starts with an Opening Balance of what is still owed.';
		} else {
			offers.push({
				variant: 'purchase',
				label: 'Record the purchase',
				hint: 'The whole principal, against what it bought.'
			});
			if (cardIsLiability)
				offers.push({
					variant: 'move-debt',
					to: card,
					label: 'Already recorded on the card? Move the debt',
					hint: 'Moves it from the card to this plan.'
				});
		}
		saved = { planId: r.planId, title: plan.data.title, offers, note };
		round++;
	}
</script>

<main class="mx-auto max-w-6xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else}
		<h1 class="mb-4 text-2xl font-semibold">New Installment Plan</h1>
		{#if fromTx && !saved}
			<p class="mb-4 text-sm text-gray-600">
				From the Transaction
				<a class="underline" href={resolve('/transactions/[id]', { id: fromTx.id })}
					>“{fromTx.description}”, {fromTx.date}</a
				>.
			</p>
		{/if}
		{#if saved}
			<div class="mb-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
				<p class="font-medium">Saved "{saved.title}".</p>
				{#if saved.note}<p>{saved.note}</p>{/if}
				{#if saved.offers.length}
					<p class="mt-2">Optional, nothing is linked:</p>
					<ul class="mt-1 space-y-1">
						{#each saved.offers as o (o.variant)}
							<li>
								<button type="button" class="underline" onclick={() => takeOn(o)}>{o.label}</button>
								<span class="text-emerald-800">: {o.hint}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
		{#if madeAlready && !saved}
			<p class="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
				This Transaction is already repaid by
				<a class="underline" href={resolve('/installments/[id]', { id: madeAlready.id })}
					>{madeAlready.title}</a
				>.
			</p>
		{:else}
			{#key round}
				<InstallmentForm
					initial={round ? blank : initial}
					today={todayIso}
					{startedOn}
					onsubmit={create}
				/>
			{/key}
		{/if}
	{/if}
</main>
