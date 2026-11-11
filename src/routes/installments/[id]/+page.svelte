<script lang="ts">
	// An Installment Plan: its statistics, the row table, and plan actions.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ConfirmAction from '#lib/components/ConfirmAction.svelte';
	import InstallmentRows from '#lib/components/InstallmentRows.svelte';
	import InstallmentTermsForm from '#lib/components/InstallmentTermsForm.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import {
		archiveOffer,
		formatAmount,
		liabilityHint,
		planDeleteInstallment,
		planHasPayments,
		planMoveTrackedFrom,
		planSetArchived,
		planSummary,
		rowStatuses,
		shortDate,
		today,
		type ActionCheck
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const todayIso = today();
	const plan = $derived(ledger.installments.find((p) => p.id === page.params.id));
	const chart = $derived(ledger.chart);
	const rows = $derived(plan ? rowStatuses(chart, plan, { today: todayIso }) : []);
	const s = $derived(plan ? planSummary(chart, plan, { today: todayIso }) : undefined);
	const hint = $derived(plan ? liabilityHint(chart, plan) : null);
	const offerArchive = $derived(plan ? archiveOffer(chart, plan, { today: todayIso }) : false);
	let dialog = $state<null | 'terms' | 'delete' | 'archive'>(null);
	let error = $state('');

	const name = (id: string | null) =>
		(id &&
			chart
				.path(id)
				.slice(1)
				.map((a) => a.name)
				.join(' › ')) ||
		'(deleted Account)';
	const deleteCheck = $derived.by((): ActionCheck =>
		plan && planHasPayments(chart, 'installment', plan.id)
			? { allowed: false, reason: 'Transactions pay this plan. Unlink or delete them first.' }
			: { allowed: true, inside: 0 }
	);

	async function moveTracked(n: number) {
		if (!plan) return;
		error = '';
		try {
			await ledger.commit(
				planMoveTrackedFrom(chart, ledger.installments, plan, n, { now: new Date() })
			);
		} catch (err) {
			error = (err as Error).message;
		}
	}
	const peso = (c: number) => formatAmount(c);
</script>

<main class="max-w-5xl px-8 py-6">
	<a href={resolve('/installments')} class="text-sm text-gray-500">← Installments</a>
	{#if ledger.error}
		<p class="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="mt-4 text-sm text-gray-500">Loading…</p>
	{:else if !plan || !s}
		<p class="mt-4 text-sm text-gray-500">This plan no longer exists.</p>
	{:else}
		<div class="mt-2 mb-1 flex items-center justify-between">
			<h1 class="text-2xl font-semibold">
				{plan.title}
				{#if plan.kind === 'internal'}<span
						class="ml-1 rounded bg-violet-100 px-1.5 align-middle text-xs text-violet-700"
						>Internal</span
					>{/if}
			</h1>
			<div class="flex gap-3 text-sm">
				<button class="text-gray-600 hover:text-gray-900" onclick={() => (dialog = 'terms')}
					>Edit terms</button
				>
				<button class="text-red-700" onclick={() => (dialog = 'delete')}>Delete</button>
			</div>
		</div>
		{#if plan.madeFrom}
			{@const source = chart.transactions().find((t) => t.id === plan.madeFrom)}
			<p class="text-sm text-gray-500">
				Made from
				{#if source}<a class="underline" href={resolve('/transactions/[id]', { id: source.id })}
						>“{source.description}”, {shortDate(source.date!)}</a
					>{:else}a deleted Transaction{/if}
			</p>
		{/if}
		<p class="mb-4 text-sm text-gray-500">
			{plan.kind === 'internal' ? 'Repays' : 'Owed in'}
			{name(plan.accounts.repaid)} · paid from {name(plan.accounts.paying)} · bought {shortDate(
				plan.purchaseDate
			)} · {plan.entry}
			{#each plan.tags as tag (tag)}<span class="ml-1">#{tag}</span>{/each}
		</p>

		{#if offerArchive}
			<div
				class="mb-4 flex items-center justify-between rounded-lg bg-green-50 p-3 text-sm text-green-900"
			>
				<span>Every row is paid and {name(plan.accounts.repaid)} is at ₱0.00.</span>
				<button class="underline" onclick={() => (dialog = 'archive')}
					>Archive Liability Account</button
				>
			</div>
		{/if}

		<div class="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
			{#each [['Amount', s.amount], ['Grand total', s.grandTotal], ['Balance', s.balance], ['Unpaid principal', s.unpaidPrincipal]] as const as [label, v] (label)}
				<div class="rounded-xl border bg-white p-3">
					<div class="text-xs text-gray-500 uppercase">{label}</div>
					<div class="text-lg font-semibold tabular-nums">{peso(v)}</div>
				</div>
			{/each}
		</div>
		<div class="mb-4 grid gap-3 text-sm md:grid-cols-2">
			{#each [['Interest', s.interest], ['Additionals', s.additionals]] as const as [label, x] (label)}
				<div class="rounded-xl border bg-white p-3">
					<div class="mb-1 text-xs text-gray-500 uppercase">{label}</div>
					Paid {peso(x.paid)} · left {peso(x.scheduled - x.paid)} · of {peso(x.scheduled)}
					{#if x.before}<div class="text-xs text-gray-500">
							{peso(x.before)} paid before tracking
						</div>{/if}
				</div>
			{/each}
		</div>

		{#if hint}
			<p class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
				{name(plan.accounts.repaid)} holds {peso(hint.balance)}, but this plan expects {peso(
					hint.expected
				)} still owed. Check its Opening Balance or the Transactions on it.
			</p>
		{/if}

		<div class="rounded-xl border bg-white p-4">
			<div class="mb-3 flex items-center justify-end gap-2 text-sm text-gray-600">
				<label for="tracked">Track from row</label>
				<select
					id="tracked"
					class="rounded border-gray-300 py-0.5 text-sm"
					value={plan.trackedFrom}
					onchange={(e) => moveTracked(Number(e.currentTarget.value))}
				>
					{#each plan.rows as r (r.due)}<option value={r.n}>{r.n} ({shortDate(r.date)})</option
						>{/each}
				</select>
			</div>
			{#if error}<p class="mb-2 text-sm text-red-700">{error}</p>{/if}
			<InstallmentRows {plan} {rows} />
		</div>
	{/if}
</main>

{#if plan && dialog}
	<Modal onclose={() => (dialog = null)}>
		{#if dialog === 'terms'}
			<InstallmentTermsForm {plan} onclose={() => (dialog = null)} />
		{:else if dialog === 'delete'}
			<ConfirmAction
				title="Delete {plan.title}"
				check={deleteCheck}
				question="Delete this plan and its rows? Its Accounts stay. This can't be undone."
				confirmLabel="Delete"
				danger
				onclose={() => (dialog = null)}
				onconfirm={async () => {
					await ledger.commit(planDeleteInstallment(chart, plan.id));
					goto(resolve('/installments'));
				}}
			/>
		{:else}
			<ConfirmAction
				title="Archive {name(plan.accounts.repaid)}"
				check={{ allowed: true, inside: 0 }}
				question="Hide this Liability from the tree and pickers? Its history stays, and you can unarchive it."
				confirmLabel="Archive"
				onclose={() => (dialog = null)}
				onconfirm={async () => {
					await ledger.commit(
						planSetArchived(chart, plan.accounts.repaid, true, { now: new Date() })
					);
					dialog = null;
				}}
			/>
		{/if}
	</Modal>
{/if}
