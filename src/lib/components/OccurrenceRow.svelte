<script lang="ts">
	// One occurrence in Upcoming: date, plan, amount or what's left, and Skip / Move / Edit.
	// Edit asks "Only this occurrence" (amounts here) or "This and all following" (plan editor).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		formatAmount,
		parseAmount,
		linkCandidates,
		planChangeOccurrence,
		planLink,
		shortDate,
		type OccurrenceChange,
		type OccurrenceView
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import Modal from './Modal.svelte';

	let { view }: { view: OccurrenceView } = $props();
	const occ = $derived(view.occurrence);
	const status = $derived(view.status);
	const chart = $derived(ledger.chart);
	const name = (id: string) => chart.account(id)?.name ?? '(deleted Account)';

	let mode = $state<'closed' | 'choose' | 'amounts' | 'move' | 'link'>('closed');
	const candidates = $derived(mode === 'link' ? linkCandidates(chart, view) : []);
	const recordHref = $derived(
		`${resolve('/transactions/new')}?plan=${encodeURIComponent(view.plan.id)}&due=${occ.due}`
	);

	function record() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(recordHref);
	}

	async function link(txId: string) {
		error = '';
		try {
			await ledger.commit(
				planLink(
					chart,
					txId,
					{ plan: 'scheduled', planId: view.plan.id, due: occ.due },
					{ now: new Date() }
				)
			);
			mode = 'closed';
		} catch (err) {
			error = (err as Error).message;
		}
	}
	let amounts = $state<string[]>([]);
	let moveTo = $state('');
	let error = $state('');

	async function change(c: OccurrenceChange) {
		error = '';
		try {
			await ledger.commit(planChangeOccurrence(chart, view.plan, occ.due, c, { now: new Date() }));
			mode = 'closed';
		} catch (err) {
			error = (err as Error).message;
		}
	}

	function openAmounts() {
		amounts = occ.amounts.map((a) => (a === null ? '' : formatAmount(a).replace('₱', '')));
		mode = 'amounts';
	}

	function saveAmounts(e: SubmitEvent) {
		e.preventDefault();
		// Blank keeps "varies"; anything typed must be an amount above zero.
		const parsed: (number | null)[] = [];
		for (const text of amounts) {
			if (text.trim() === '') {
				parsed.push(null);
				continue;
			}
			const cents = parseAmount(text);
			if (cents === null || cents <= 0) {
				error = 'Amounts are above zero, or blank when they vary';
				return;
			}
			parsed.push(cents);
		}
		change({ amounts: parsed });
	}
</script>

<li
	class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm {status.overdue ? 'bg-amber-50' : ''}"
>
	<div class="w-24 shrink-0">
		<div class={status.overdue ? 'font-medium text-amber-800' : ''}>{shortDate(occ.date)}</div>
		{#if occ.date !== occ.due}<div class="text-xs text-gray-500">
				moved from {shortDate(occ.due)}
			</div>{/if}
		{#if status.overdue}<div class="text-xs text-amber-700">overdue</div>{/if}
	</div>
	<a href={resolve('/scheduled/[id]', { id: view.plan.id })} class="min-w-0 flex-1 hover:underline">
		<span class="block truncate">{occ.version.description}</span>
		<span class="block truncate text-xs text-gray-500"
			>{occ.version.lines
				.filter((l) => l.side === 'from')
				.map((l) => name(l.accountId))
				.join(' + ')} → {occ.version.lines
				.filter((l) => l.side === 'to')
				.map((l) => name(l.accountId))
				.join(' + ')}</span
		>
	</a>
	<div class="w-32 text-right tabular-nums">
		{#if status.status === 'partly-paid'}
			<div class="text-amber-800">
				{status.remaining === null ? 'Partly paid' : `${formatAmount(status.remaining)} left`}
			</div>
			<div class="text-xs text-gray-500">paid {formatAmount(status.paid)}</div>
		{:else}
			{occ.total === null ? 'Varies' : formatAmount(occ.total)}
		{/if}
	</div>
	<div class="flex gap-1 text-xs">
		<button class="rounded bg-gray-900 px-2 py-1 text-white hover:bg-gray-700" onclick={record}
			>Record</button
		>
		<button class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => (mode = 'link')}
			>Link…</button
		>
		{#if status.status === 'partly-paid'}
			<button
				class="rounded px-2 py-1 hover:bg-gray-100"
				title="Settle it as paid, for example after a discount"
				onclick={() => change({ settled: true })}>Mark paid</button
			>
		{/if}
		<button class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => change({ skipped: true })}
			>Skip</button
		>
		<button
			class="rounded px-2 py-1 hover:bg-gray-100"
			onclick={() => {
				moveTo = occ.date;
				mode = 'move';
			}}>Move</button
		>
		<button class="rounded px-2 py-1 hover:bg-gray-100" onclick={() => (mode = 'choose')}
			>Edit</button
		>
	</div>
	{#if error && mode === 'closed'}<p class="w-full text-xs text-red-600">{error}</p>{/if}
</li>

{#if mode !== 'closed'}
	<Modal onclose={() => (mode = 'closed')}>
		<div class="space-y-4 text-sm">
			<h2 class="text-lg font-semibold">{occ.version.description}, {shortDate(occ.due)}</h2>
			{#if mode === 'choose'}
				<p class="text-gray-600">Change which occurrences?</p>
				<div class="grid gap-2">
					<button class="rounded-lg border p-3 text-left hover:bg-gray-50" onclick={openAmounts}>
						<span class="font-medium">Only this occurrence</span>
						<span class="block text-xs text-gray-500"
							>Its amounts, for example once the bill arrives.</span
						>
					</button>
					<button
						class="rounded-lg border p-3 text-left hover:bg-gray-50"
						onclick={() =>
							goto(
								// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
								`${resolve('/scheduled/[id]/edit', { id: view.plan.id })}?from=${occ.due}`
							)}
					>
						<span class="font-medium">This and all following</span>
						<span class="block text-xs text-gray-500"
							>Anything in the plan, the repeat rule included.</span
						>
					</button>
				</div>
			{:else if mode === 'link'}
				<p class="text-gray-600">
					Unlinked Transactions on this plan's Accounts within a week of {shortDate(occ.date)}:
				</p>
				{#if candidates.length === 0}
					<p class="text-gray-500">None found. Record it instead.</p>
				{:else}
					<ul class="divide-y rounded-lg border">
						{#each candidates as t (t.id)}
							<li class="flex items-center justify-between gap-2 px-3 py-2">
								<span class="min-w-0 truncate">{t.date} · {t.description}</span>
								<span class="flex items-center gap-2">
									<span class="tabular-nums"
										>{formatAmount(
											t.entries.reduce((sum, e) => sum + Math.max(e.amount, 0), 0)
										)}</span
									>
									<button
										class="rounded border px-2 py-0.5 text-xs hover:bg-gray-50"
										onclick={() => link(t.id)}>Link</button
									>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if mode === 'move'}
				<form
					class="flex items-center gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						change({ movedTo: moveTo });
					}}
				>
					<input
						type="date"
						bind:value={moveTo}
						class="rounded border-gray-300 text-sm"
						aria-label="New date"
					/>
					<button class="rounded bg-gray-900 px-3 py-1 text-white">Move</button>
				</form>
			{:else if mode === 'amounts'}
				<form class="space-y-2" onsubmit={saveAmounts}>
					{#each occ.version.lines as line, i (i)}
						<label class="flex items-center justify-between gap-3">
							<span
								>{line.side === 'from' ? 'From' : line.fee ? 'Fee to' : 'To'}
								{name(line.accountId)}</span
							>
							<input
								bind:value={amounts[i]}
								inputmode="decimal"
								placeholder="varies"
								class="w-32 rounded border-gray-300 text-right text-sm"
							/>
						</label>
					{/each}
					<div class="flex justify-end">
						<button class="rounded bg-gray-900 px-3 py-1 text-white">Save</button>
					</div>
				</form>
			{/if}
			{#if error}<p class="text-xs text-red-600">{error}</p>{/if}
		</div>
	</Modal>
{/if}
