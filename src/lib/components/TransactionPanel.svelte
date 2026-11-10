<script lang="ts">
	// Transaction detail in a right-hand side panel: everything about one Transaction, with
	// Edit / Duplicate / Delete and one-click clear or set pending.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		formatAmount,
		journalRow,
		planDeleteTransaction,
		planSetStatus,
		planUnlink,
		type ActionCheck,
		type Transaction
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import ConfirmAction from './ConfirmAction.svelte';
	import { KIND } from './kind.ts';
	import Modal from './Modal.svelte';

	let {
		tx,
		onclose,
		ontag
	}: { tx: Transaction; onclose: () => void; ontag: (tag: string) => void } = $props();

	const chart = $derived(ledger.chart);
	const row = $derived(journalRow(chart, tx));
	const path = (id: string) =>
		chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ') || '(deleted Account)';
	const due = (iso: string) =>
		new Date(`${iso}T00:00`).toLocaleDateString('en-PH', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});

	/** What the Transaction pays, by name: "Rent, 5 Dec 2026". */
	const paysLabel = $derived.by(() => {
		if (!tx.pays) return '';
		const plan = ledger.scheduled.find((p) => p.id === tx.pays!.planId);
		const name =
			plan?.versions.findLast((v) => v.from <= tx.pays!.due)?.description ??
			plan?.versions[0].description;
		return `${name ?? 'a deleted plan'}, ${due(tx.pays.due)}`;
	});

	async function unlink() {
		statusError = '';
		try {
			await ledger.commit(
				planUnlink(chart, tx.id, {
					now: new Date(),
					plans: [...ledger.scheduled, ...ledger.installments]
				})
			);
		} catch (err) {
			statusError = `Could not unlink: ${(err as Error).message}`;
		}
	}

	let confirmDelete = $state(false);
	let statusError = $state('');
	const deleteCheck = $derived.by((): ActionCheck => {
		try {
			planDeleteTransaction(chart, tx.id);
			return { allowed: true, inside: 0 };
		} catch (err) {
			return { allowed: false, reason: (err as Error).message };
		}
	});

	function duplicate() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/transactions/new')}?copy=${encodeURIComponent(tx.id)}`);
	}

	async function toggleStatus() {
		statusError = '';
		try {
			await ledger.commit(
				planSetStatus(chart, tx.id, row.pending ? 'cleared' : 'pending', { now: new Date() })
			);
		} catch (err) {
			statusError = `Could not change the status: ${(err as Error).message}`;
		}
	}
</script>

<aside class="space-y-4 text-sm" aria-label="Transaction detail">
	<div class="flex items-start justify-between gap-2">
		<div>
			<p class="text-xs text-gray-500">{tx.date}</p>
			<h2 class="text-lg font-semibold">{tx.description}</h2>
		</div>
		<button onclick={onclose} class="text-gray-400 hover:text-gray-900" aria-label="Close">✕</button
		>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<span class="rounded-full px-2 py-0.5 text-xs {KIND[row.kind].style}"
			>{KIND[row.kind].label}</span
		>
		<button
			onclick={toggleStatus}
			title={row.pending ? 'Mark cleared' : 'Mark pending'}
			class="rounded-full px-2 py-0.5 text-xs {row.pending
				? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
				: 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
			>{row.pending ? 'Pending' : 'Cleared'}</button
		>
		{#each tx.tags as tag (tag)}
			<button
				onclick={() => ontag(tag)}
				class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
				>#{tag}</button
			>
		{/each}
		<span class="ml-auto font-semibold tabular-nums">{formatAmount(row.total)}</span>
	</div>
	{#if statusError}<p class="text-xs text-red-600">{statusError}</p>{/if}

	<div class="grid grid-cols-2 gap-4">
		{#each [['From', tx.entries.filter((e) => e.amount < 0)], ['To', tx.entries.filter((e) => e.amount > 0)]] as const as [label, entries] (label)}
			<div>
				<p class="mb-1 text-xs font-semibold text-gray-500 uppercase">{label}</p>
				{#each entries as e, i (i)}
					<p class="flex justify-between gap-2">
						<span class="min-w-0 truncate" title={path(e.accountId)}
							>{path(e.accountId)}{#if e.fee}<span class="ml-1 text-xs text-gray-400"
									>(fee, {e.fee === 'additional' ? 'additional' : 'less'})</span
								>{/if}</span
						>
						<span class="tabular-nums">{formatAmount(Math.abs(e.amount))}</span>
					</p>
				{/each}
			</div>
		{/each}
	</div>

	{#if tx.pays}
		<p class="flex items-center justify-between gap-2 rounded bg-sky-50 p-2 text-sky-900">
			<span>
				Pays:
				{#if ledger.scheduled.some((p) => p.id === tx.pays?.planId)}
					<a class="underline" href={resolve('/scheduled/[id]', { id: tx.pays.planId })}
						>{paysLabel}</a
					>
				{:else}
					{paysLabel}
				{/if}
			</span>
			<button onclick={unlink} class="rounded px-2 py-0.5 text-xs hover:bg-sky-100">Unlink</button>
		</p>
	{/if}

	{#if tx.note}
		<p class="rounded bg-yellow-50 p-3 whitespace-pre-line text-gray-700">{tx.note}</p>
	{/if}

	<div class="flex gap-2">
		<a
			href={resolve('/transactions/[id]', { id: tx.id })}
			class="rounded border px-3 py-1 hover:bg-gray-50">Edit</a
		>
		<button onclick={duplicate} class="rounded border px-3 py-1 hover:bg-gray-50">Duplicate</button>
		<button
			onclick={() => (confirmDelete = true)}
			class="rounded border px-3 py-1 text-red-700 hover:bg-red-50">Delete</button
		>
	</div>
</aside>

{#if confirmDelete}
	<Modal onclose={() => (confirmDelete = false)}>
		<ConfirmAction
			title="Delete Transaction"
			check={deleteCheck}
			question={`Delete "${tx.description}" (${tx.date}, ${row.from.join(' + ')} → ${row.to.join(' + ')}, ${formatAmount(row.total)})?${
				tx.pays ? ` This makes ${paysLabel} unpaid or partly paid.` : ''
			} This can't be undone.`}
			confirmLabel="Delete"
			danger
			onclose={() => (confirmDelete = false)}
			onconfirm={async () => {
				await ledger.commit(
					planDeleteTransaction(chart, tx.id, {
						now: new Date(),
						plans: [...ledger.scheduled, ...ledger.installments]
					})
				);
				confirmDelete = false;
				onclose();
			}}
		/>
	</Modal>
{/if}
