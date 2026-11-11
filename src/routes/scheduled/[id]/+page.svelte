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

<main class="max-w-3xl px-8 py-6">
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
		<div class="mt-3 mb-6 rounded-xl bg-gray-900 p-5 text-white">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h1 class="text-xl font-semibold">{v.description}</h1>
					<p class="text-sm text-gray-300">{describeRule(v.rule)} · {endText}</p>
					<p class="mt-1 text-sm text-gray-400">
						{v.lines
							.filter((l) => l.side === 'from')
							.map((l) => name(l.accountId))
							.join(' + ')} →
						{v.lines
							.filter((l) => l.side === 'to')
							.map(
								(l) =>
									`${name(l.accountId)} ${l.amount === null ? '(varies)' : formatAmount(l.amount)}`
							)
							.join(' + ')}
					</p>
					<p class="mt-1 text-sm">{next ? `Next: ${shortDate(next.date)}` : 'Ended'}</p>
				</div>
				<div class="flex gap-1 text-xs text-gray-300">
					<a
						href={resolve('/scheduled/[id]/edit', { id: plan.id })}
						class="rounded px-2 py-1 hover:bg-gray-800 hover:text-white">Edit</a
					>
					{#if next}
						<button
							onclick={() => (dialog = 'end')}
							class="rounded px-2 py-1 hover:bg-gray-800 hover:text-white">End</button
						>
					{/if}
					<button
						onclick={() => (dialog = 'delete')}
						class="rounded px-2 py-1 text-red-300 hover:bg-gray-800">Delete</button
					>
				</div>
			</div>
			{#if v.note}<p class="mt-3 text-sm whitespace-pre-line text-gray-300">{v.note}</p>{/if}
		</div>

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
								: ''}{#if o.total !== null && s.status !== 'skipped'}<span class="text-gray-400">
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
