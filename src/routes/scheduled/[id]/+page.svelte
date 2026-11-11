<script lang="ts">
	// One plan: what it is, its next date, its past occurrences with their payments, and
	// Edit / End / Delete. Delete only while nothing pays it; otherwise End.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ConfirmAction from '#lib/components/ConfirmAction.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import {
		describeRule,
		formatAmount,
		nextOccurrence,
		planDeletePlan,
		planChangeOccurrence,
		planEndPlan,
		planAmount,
		planHistory,
		shortDate,
		today,
		type ActionCheck
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const todayIso = today();
	const chart = $derived(ledger.chart);
	const plan = $derived(ledger.scheduled.find((p) => p.id === page.params.id));
	const v = $derived(plan?.versions.at(-1));
	const next = $derived(plan && nextOccurrence(plan, { today: todayIso }));
	const history = $derived(
		plan
			? planHistory(chart, plan, {
					today: todayIso,
					scheduled: ledger.scheduled,
					installments: ledger.installments
				})
			: []
	);
	const name = (id: string) => chart.account(id)?.name ?? '(deleted Account)';
	const total = $derived(v ? planAmount(v) : null);
	const endText = $derived(
		!plan
			? ''
			: plan.end.type === 'never'
				? 'No end date'
				: plan.end.type === 'on'
					? `Ends ${shortDate(plan.end.date)}`
					: `Ends after ${plan.end.count} occurrences`
	);
	const STATUS = {
		paid: 'bg-emerald-100 text-emerald-800',
		'partly-paid': 'bg-amber-100 text-amber-800',
		unpaid: 'bg-amber-100 text-amber-800',
		skipped: 'bg-gray-100 text-gray-600'
	} as const;
	const LABEL = {
		paid: 'Paid',
		'partly-paid': 'Partly paid',
		unpaid: 'Unpaid',
		skipped: 'Skipped'
	};

	let settleError = $state('');
	/** Mark paid (after at least one payment) or unpaid again. */
	async function settle(due: string, settled: boolean) {
		if (!plan) return;
		settleError = '';
		try {
			await ledger.commit(planChangeOccurrence(chart, plan, due, { settled }, { now: new Date() }));
		} catch (err) {
			settleError = (err as Error).message;
		}
	}

	let dialog = $state<'end' | 'delete' | null>(null);
	const deleteCheck = $derived.by((): ActionCheck => {
		try {
			if (plan) planDeletePlan(chart, plan.id);
			return { allowed: true, inside: 0 };
		} catch (err) {
			return { allowed: false, reason: (err as Error).message };
		}
	});
</script>

<main class="page-pad">
	{#if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your plans…</p>
	{:else if !plan || !v}
		<p class="text-sm text-gray-500">
			This plan no longer exists. <a class="text-sky-700 underline" href={resolve('/scheduled')}
				>Back to Scheduled</a
			>
		</p>
	{:else}
		<a href={resolve('/scheduled')} class="text-sm text-sky-700 hover:underline">← Scheduled</a>
		<header class="mt-3 flex flex-wrap items-start justify-between gap-6">
			<div class="min-w-0">
				<h1 class="text-3xl font-semibold tracking-tight break-words">{v.description}</h1>
				<p class="mt-1 text-sm text-gray-500">{describeRule(v.rule)} · {endText}</p>
			</div>
			<dl class="flex gap-8 text-right">
				<div>
					<dt class="text-xs text-gray-500">Amount</dt>
					<dd class="text-2xl font-semibold tabular-nums">
						{total === null ? 'Varies' : formatAmount(total)}
					</dd>
				</div>
				<div>
					<dt class="text-xs text-gray-500">Next</dt>
					<dd class="text-2xl">{next ? shortDate(next.date) : 'Ended'}</dd>
				</div>
			</dl>
		</header>

		<div class="mt-5 flex flex-wrap gap-2 border-b pb-4 text-sm">
			<a
				href={resolve('/scheduled/[id]/edit', { id: plan.id })}
				class="rounded-md bg-gray-900 px-4 py-1.5 font-medium text-white hover:bg-gray-700">Edit</a
			>
			{#if next}
				<button
					onclick={() => (dialog = 'end')}
					class="rounded-md border border-gray-300 bg-white px-4 py-1.5 hover:bg-gray-50"
					>End plan</button
				>
			{/if}
			<button
				onclick={() => (dialog = 'delete')}
				class="rounded-md border border-red-200 bg-white px-4 py-1.5 text-red-700 hover:bg-red-50"
				>Delete</button
			>
		</div>

		<div class="mt-5 grid gap-4 md:grid-cols-2">
			{#each [['from', 'From'], ['to', 'To']] as const as [side, label] (side)}
				<section class="rounded-xl border bg-white p-4 text-sm">
					<h2 class="mb-2 text-xs font-semibold text-gray-500 uppercase">{label}</h2>
					<ul class="space-y-1">
						{#each v.lines.filter((l) => l.side === side) as l, i (i)}
							<li class="flex justify-between gap-3">
								<span class="min-w-0 truncate"
									>{name(l.accountId)}{#if l.fee}<span class="ml-1 text-xs text-gray-500">fee</span
										>{/if}</span
								>
								<span class="tabular-nums"
									>{l.amount === null ? 'Varies' : formatAmount(l.amount)}</span
								>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
		{#if v.note}
			<p class="mt-4 rounded-xl border bg-white p-4 text-sm whitespace-pre-line text-gray-700">
				{v.note}
			</p>
		{/if}

		<div class="mt-8">
			<section class="min-w-0">
				<h2 class="mb-2 text-sm font-semibold text-gray-500 uppercase">Past occurrences</h2>
				{#if settleError}<p class="mb-2 text-xs text-red-600">{settleError}</p>{/if}
				{#if history.length === 0}
					<p class="rounded-xl border bg-white px-5 py-6 text-center text-sm text-gray-500">
						None yet.
					</p>
				{:else}
					<ul class="divide-y rounded-xl border bg-white text-sm">
						{#each history as { occurrence: o, status: s } (o.due)}
							<li class="flex flex-wrap items-center gap-3 px-4 py-3">
								<span class="w-28">{shortDate(o.date)}</span>
								<span class="rounded-full px-2 py-0.5 text-xs {STATUS[s.status]}"
									>{LABEL[s.status]}</span
								>
								<span class="flex-1 text-xs text-gray-500">
									{#each s.payments as t, i (t.id)}{i ? ', ' : ''}<a
											class="hover:underline"
											href={resolve('/transactions/[id]', { id: t.id })}>{t.date} {t.description}</a
										>{/each}
								</span>
								<span class="tabular-nums"
									>{s.paid
										? formatAmount(s.paid)
										: ''}{#if o.total !== null && s.status !== 'skipped'}<span
											class="text-gray-400"
										>
											/ {formatAmount(o.total)}</span
										>{/if}</span
								>
								{#if o.settled && s.status === 'paid'}
									<button
										class="rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
										title="Marked paid by hand"
										onclick={() => settle(o.due, false)}>Mark unpaid</button
									>
								{:else if s.status === 'partly-paid'}
									<button
										class="rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
										onclick={() => settle(o.due, true)}>Mark paid</button
									>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</div>
	{/if}
</main>

{#if dialog && plan && v}
	<Modal onclose={() => (dialog = null)}>
		{#if dialog === 'end'}
			<ConfirmAction
				title="End {v.description}"
				check={{ allowed: true, inside: 0 }}
				question="Stop producing occurrences after today? Its history and paid links stay."
				confirmLabel="End plan"
				onclose={() => (dialog = null)}
				onconfirm={async () => {
					await ledger.commit(planEndPlan(plan, { today: todayIso, now: new Date() }));
					dialog = null;
				}}
			/>
		{:else}
			<ConfirmAction
				title="Delete {v.description}"
				check={deleteCheck}
				question="Delete this plan and all its occurrences? This can't be undone."
				confirmLabel="Delete"
				danger
				onclose={() => (dialog = null)}
				onconfirm={async () => {
					await ledger.commit(planDeletePlan(chart, plan.id));
					goto(resolve('/scheduled'));
				}}
			/>
		{/if}
	</Modal>
{/if}
