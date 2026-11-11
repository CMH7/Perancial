<script lang="ts">
	// The Journal: every Transaction, newest first. The left pane filters: search, dates, kind,
	// status, tag, and an Account picked from the Account tree (a Group covers its Accounts). A row
	// opens the detail side panel. Checkboxes select rows for bulk clear and date changes.
	import { resolve } from '$app/paths';
	import { KIND } from '#lib/components/kind.ts';
	import ConfirmAction from '#lib/components/ConfirmAction.svelte';
	import Drawer from '#lib/components/Drawer.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import TransactionPanel from '#lib/components/TransactionPanel.svelte';
	import {
		formatAmount,
		journal,
		journalRow,
		noFilters,
		planBillOn,
		planDeleteTransactions,
		planQuickChange,
		selectionAfterFilter,
		today,
		type ActionCheck,
		type QuickChange,
		type TransactionKind
	} from '#lib/domain/index.ts';
	import AccountTree from '#lib/components/AccountTree.svelte';
	import SplitPane from '#lib/components/SplitPane.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';

	let f = $state(noFilters());
	let openId = $state<string | null>(null);

	const chart = $derived(ledger.chart);
	const rows = $derived(journal(chart, f));
	const open = $derived(openId ? chart.transaction(openId) : undefined);
	const total = $derived(chart.transactions().filter((t) => t.origin === 'normal').length);
	const tags = $derived([...new Set(chart.transactions().flatMap((t) => t.tags))].sort());
	/** The Root Account whose tree the pane shows; picking a tab also filters to it. */
	let treeRoot = $state('expense');
	let collapsed = $state(false);
	let showArchived = $state(false);
	const pickedAccount = $derived(f.accountId ? chart.account(f.accountId) : undefined);
	function pickAccount(id: string) {
		if (chart.account(id)?.system === 'root') treeRoot = id;
		f.accountId = f.accountId === id ? '' : id;
	}
	$effect(() => {
		// A filter set elsewhere (cleared, or picked in the tree) keeps the tree on its type.
		const root = f.accountId ? chart.path(f.accountId)[0]?.id : undefined;
		if (root && root !== treeRoot) treeRoot = root;
	});
	const kinds = Object.entries(KIND) as [TransactionKind, (typeof KIND)[TransactionKind]][];
	const filtering = $derived(Object.values(f).some(Boolean));

	// Multi-select: only rows still shown count, so a filter change never acts on hidden rows.
	let picked = $state(new Set<string>());
	let lastPicked = $state<number | null>(null);
	let bulkDate = $state(today());
	let bulkError = $state('');
	let busy = $state(false);
	const visibleIds = $derived(rows.map((r) => r.id));
	const selected = $derived(selectionAfterFilter(picked, visibleIds));
	const allSelected = $derived(rows.length > 0 && selected.size === rows.length);
	const selectedPending = $derived(
		rows.filter((r) => selected.has(r.id) && r.status === 'pending')
	);
	const selectedCleared = $derived(selected.size - selectedPending.length);
	// Bill on: only for charges on a Liability; clearing works on any that has one.
	let bulkBillOn = $state('');
	const selectedBilled = $derived(
		[...selected].filter((id) => chart.transaction(id)?.billOn).length
	);

	/** Ticks or unticks one row; with Shift, every row between it and the last one ticked. */
	function pick(index: number, on: boolean, range: boolean) {
		// A plain Set: it is built here and assigned whole, never mutated while reactive.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const next = new Set(selected);
		const [a, b] =
			range && lastPicked !== null
				? [Math.min(lastPicked, index), Math.max(lastPicked, index)]
				: [index, index];
		for (const id of visibleIds.slice(a, b + 1)) {
			if (on) next.add(id);
			else next.delete(id);
		}
		picked = next;
		lastPicked = index;
	}

	function pickAll(on: boolean) {
		picked = on ? new Set(visibleIds) : new Set();
		lastPicked = null;
	}

	// Bulk delete: checked against the whole selection, so it deletes all or none.
	let confirmDelete = $state(false);
	const plans = $derived([...ledger.scheduled, ...ledger.installments]);
	const deleteCheck = $derived.by((): ActionCheck => {
		try {
			planDeleteTransactions(chart, [...selected], { plans });
			return { allowed: true, inside: 0 };
		} catch (err) {
			return { allowed: false, reason: (err as Error).message };
		}
	});
	const selectedPaying = $derived(rows.filter((r) => selected.has(r.id) && r.pays).length);
	const deleteQuestion = $derived(
		`Delete ${selected.size} Transaction${selected.size === 1 ? '' : 's'}?` +
			(selectedPaying
				? ` ${selectedPaying} of them pay${selectedPaying === 1 ? 's' : ''} a Scheduled Transaction or Installment Plan, which becomes unpaid or partly paid.`
				: '') +
			" This can't be undone."
	);
	async function bulkDelete() {
		const ids = [...selected];
		await ledger.commit(planDeleteTransactions(chart, ids, { now: new Date(), plans }));
		if (openId && ids.includes(openId)) openId = null;
		confirmDelete = false;
		pickAll(false);
	}

	const bulk = (change: QuickChange) =>
		run(() => planQuickChange(chart, [...selected], change, { now: new Date(), today: today() }));
	const bulkBill = (billOn: string | null) =>
		run(() => planBillOn(chart, [...selected], billOn, { now: new Date() }));
	async function run(plan: () => ReturnType<typeof planBillOn>) {
		bulkError = '';
		busy = true;
		try {
			await ledger.commit(plan());
			pickAll(false);
		} catch (err) {
			bulkError = `Nothing was changed: ${(err as Error).message}`;
		} finally {
			busy = false;
		}
	}
</script>

{#snippet filters()}
	<div class="grid gap-2 text-sm">
		<input
			type="search"
			bind:value={f.q}
			placeholder="Search Description, Note, tags, Accounts…"
			aria-label="Search"
			class="w-full rounded-lg border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
		/>
		<div class="grid grid-cols-2 gap-2">
			<label class="text-xs text-gray-500"
				>From<input
					type="date"
					bind:value={f.from}
					class="mt-0.5 w-full rounded border-gray-300 py-1 text-sm"
				/></label
			>
			<label class="text-xs text-gray-500"
				>To<input
					type="date"
					bind:value={f.to}
					class="mt-0.5 w-full rounded border-gray-300 py-1 text-sm"
				/></label
			>
		</div>
		<div class="grid grid-cols-3 gap-2">
			<select bind:value={f.kind} aria-label="Kind" class="rounded border-gray-300 py-1 text-sm">
				<option value="">Any kind</option>
				{#each kinds as [key, k] (key)}<option value={key}>{k.label}</option>{/each}
			</select>
			<select
				bind:value={f.status}
				aria-label="Status"
				class="rounded border-gray-300 py-1 text-sm"
			>
				<option value="">Any status</option>
				<option value="cleared">Cleared</option>
				<option value="pending">Pending</option>
			</select>
			<select bind:value={f.tag} aria-label="Tag" class="rounded border-gray-300 py-1 text-sm">
				<option value="">Any tag</option>
				{#each tags as tag (tag)}<option value={tag}>#{tag}</option>{/each}
			</select>
		</div>
	</div>
{/snippet}

{#if ledger.error}
	<main class="mx-auto max-w-3xl px-4 py-8">
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	</main>
{:else if !ledger.ready}
	<main class="mx-auto max-w-3xl px-4 py-8">
		<p class="text-sm text-gray-500">Loading your Transactions…</p>
	</main>
{:else}
	<SplitPane storageKey="perancial.journal.paneCollapsed" bind:collapsed>
		{#snippet pane()}
			<AccountTree
				rootId={treeRoot}
				selectedId={f.accountId || undefined}
				onpick={pickAccount}
				extra={filters}
				bind:showArchived
				bind:collapsed
			/>
		{/snippet}

		<main class="page-pad">
			<div class="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h1 class="text-2xl font-semibold">Journal</h1>
				<span class="text-xs text-gray-500">{rows.length} of {total} Transactions</span>
				{#if pickedAccount}
					<button
						class="flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs ring-1 ring-gray-300 hover:ring-gray-500"
						title="Stop filtering by this Account"
						onclick={() => (f.accountId = '')}
						>{chart
							.path(pickedAccount.id)
							.map((a) => a.name)
							.join(' › ')}<span aria-hidden="true" class="text-gray-400">×</span></button
					>
				{/if}
				{#if filtering}
					<button class="text-xs text-sky-700 hover:underline" onclick={() => (f = noFilters())}
						>Clear filters</button
					>
				{/if}
				<a
					href={resolve('/transactions/new')}
					class="ml-auto rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700"
					>New Transaction</a
				>
			</div>

			{#if selected.size}
				<div
					class="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 p-2 text-sm shadow-sm"
					role="toolbar"
					aria-label="Bulk actions"
				>
					<span class="font-medium">{selected.size} selected</span>
					<button
						class="rounded border border-sky-300 bg-white px-3 py-1 hover:bg-sky-100 disabled:opacity-50"
						disabled={busy || selectedPending.length === 0}
						title={selectedPending.length ? '' : 'None of the selected rows is pending'}
						onclick={() => bulk({ status: 'cleared' })}
						>Mark cleared{selectedPending.length ? ` (${selectedPending.length})` : ''}</button
					>
					<button
						class="rounded border border-sky-300 bg-white px-3 py-1 hover:bg-sky-100 disabled:opacity-50"
						disabled={busy || selectedCleared === 0}
						title={selectedCleared ? '' : 'None of the selected rows is cleared'}
						onclick={() => bulk({ status: 'pending' })}
						>Mark pending{selectedCleared ? ` (${selectedCleared})` : ''}</button
					>
					<span class="flex items-center gap-1">
						<input
							type="date"
							bind:value={bulkDate}
							max={today()}
							aria-label="New date"
							class="rounded border-gray-300 py-1 text-sm"
						/>
						<button
							class="rounded border border-sky-300 bg-white px-3 py-1 hover:bg-sky-100 disabled:opacity-50"
							disabled={busy || !bulkDate}
							onclick={() => bulk({ date: bulkDate })}>Set date</button
						>
						<button
							class="rounded border border-sky-300 bg-white px-3 py-1 hover:bg-sky-100 disabled:opacity-50"
							disabled={busy || !bulkDate}
							onclick={() => bulk({ status: 'cleared', date: bulkDate })}>Clear on this date</button
						>
					</span>
					<span class="flex items-center gap-1">
						<input
							type="date"
							bind:value={bulkBillOn}
							aria-label="Bill on date"
							title="Charges on a Liability are billed from this day, so a later payment bills them"
							class="rounded border-gray-300 py-1 text-sm"
						/>
						<button
							class="rounded border border-sky-300 bg-white px-3 py-1 hover:bg-sky-100 disabled:opacity-50"
							disabled={busy || !bulkBillOn}
							onclick={() => bulkBill(bulkBillOn)}>Set bill on</button
						>
						<button
							class="rounded border border-sky-300 bg-white px-3 py-1 hover:bg-sky-100 disabled:opacity-50"
							disabled={busy || selectedBilled === 0}
							title={selectedBilled ? '' : 'None of the selected rows has a bill date'}
							onclick={() => bulkBill(null)}
							>Clear bill on{selectedBilled ? ` (${selectedBilled})` : ''}</button
						>
					</span>
					<button
						class="rounded border border-red-300 bg-white px-3 py-1 text-red-700 hover:bg-red-50 disabled:opacity-50"
						disabled={busy}
						onclick={() => (confirmDelete = true)}>Delete</button
					>
					<button class="ml-auto text-sky-700 hover:underline" onclick={() => pickAll(false)}
						>Deselect</button
					>
					{#if bulkError}<p class="w-full text-xs text-red-600">{bulkError}</p>{/if}
				</div>
			{/if}

			{#if total === 0}
				<p class="text-sm text-gray-500">
					No Transactions yet. <a class="text-sky-700 underline" href={resolve('/transactions/new')}
						>Record one</a
					>.
				</p>
			{:else}
				<table class="w-full text-sm">
					<thead class="text-left text-xs text-gray-500 uppercase">
						<tr>
							<th class="w-8 py-2 pr-2">
								<input
									type="checkbox"
									aria-label="Select all shown"
									checked={allSelected}
									indeterminate={selected.size > 0 && !allSelected}
									disabled={rows.length === 0}
									onchange={(e) => pickAll(e.currentTarget.checked)}
									class="rounded border-gray-300"
								/>
							</th>
							<th class="py-2 pr-3">Date</th>
							<th class="pr-3">Description</th>
							<th class="pr-3">From → To</th>
							<th class="pr-3">Kind</th>
							<th class="text-right">Amount</th>
						</tr>
					</thead>
					<tbody>
						{#each rows as tx, i (tx.id)}
							{@const row = journalRow(chart, tx)}
							<tr
								onclick={() => (openId = tx.id)}
								class="cursor-pointer border-t hover:bg-gray-50 {openId === tx.id
									? 'bg-sky-50'
									: ''} {selected.has(tx.id) ? 'bg-sky-50/60' : ''} {row.pending
									? 'text-amber-700 italic'
									: ''}"
							>
								<td class="py-2 pr-2">
									<input
										type="checkbox"
										aria-label="Select {tx.description}"
										checked={selected.has(tx.id)}
										onclick={(e) => {
											e.stopPropagation();
											pick(i, e.currentTarget.checked, e.shiftKey);
										}}
										class="rounded border-gray-300"
									/>
								</td>
								<td class="py-2 pr-3 whitespace-nowrap">{tx.date}</td>
								<td class="pr-3">
									<button class="text-left hover:underline" onclick={() => (openId = tx.id)}
										>{tx.description}</button
									>
									{#each tx.tags as tag (tag)}
										<button
											class="ml-1 text-xs text-gray-500 not-italic hover:text-sky-700"
											onclick={(e) => {
												e.stopPropagation();
												f.tag = tag;
											}}>#{tag}</button
										>
									{/each}
								</td>
								<td class="pr-3 text-gray-500">{row.from.join(' + ')} → {row.to.join(' + ')}</td>
								<td class="pr-3">
									<span class="rounded-full px-2 py-0.5 text-xs not-italic {KIND[row.kind].style}"
										>{KIND[row.kind].label}</span
									>
								</td>
								<td class="text-right tabular-nums">{formatAmount(row.total)}</td>
							</tr>
						{:else}
							<tr><td colspan="6" class="py-4 text-gray-500">No Transactions match.</td></tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</main>
	</SplitPane>
{/if}

{#if confirmDelete}
	<Modal onclose={() => (confirmDelete = false)}>
		<ConfirmAction
			title="Delete Transactions"
			check={deleteCheck}
			question={deleteQuestion}
			confirmLabel="Delete {selected.size}"
			danger
			onclose={() => (confirmDelete = false)}
			onconfirm={bulkDelete}
		/>
	</Modal>
{/if}

{#if open}
	<Drawer id="journal-transaction">
		<TransactionPanel tx={open} onclose={() => (openId = null)} ontag={(tag) => (f.tag = tag)} />
	</Drawer>
{/if}
