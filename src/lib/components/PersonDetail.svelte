<script lang="ts">
	// One Person: where the owner stands with them, their linked Accounts, the Transactions that
	// name them, and rename / archive / delete / Fill from links.
	import { resolve } from '$app/paths';
	import {
		formatAmount,
		personDetail,
		personLabel,
		planArchivePerson,
		planDeletePerson,
		planFillFromLinks,
		planSavePerson,
		shortDate,
		type ChartWrite
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let { personId, onremoved }: { personId: string; onremoved: () => void } = $props();

	const chart = $derived(ledger.chart);
	const person = $derived(ledger.persons.find((p) => p.id === personId));
	const detail = $derived(person ? personDetail(chart, person.id) : undefined);
	const fill = $derived(person ? planFillFromLinks(chart, person.id, { now: new Date() }) : []);

	let renaming = $state(false);
	let name = $state('');
	let error = $state('');
	let confirmFill = $state(false);
	let busy = $state(false);

	/** Commits the writes `plan` returns; false (with the error shown) when it throws. */
	async function run(plan: () => ChartWrite[]) {
		error = '';
		busy = true;
		try {
			await ledger.commit(plan());
			return true;
		} catch (err) {
			error = (err as Error).message;
			return false;
		} finally {
			busy = false;
		}
	}

	async function rename(e: SubmitEvent) {
		e.preventDefault();
		if (!person) return;
		const id = person.id;
		if (await run(() => planSavePerson(ledger.persons, { id, name }, { now: new Date() })))
			renaming = false;
	}

	async function remove() {
		if (!person) return;
		const id = person.id;
		if (await run(() => planDeletePerson({ chart, scheduled: ledger.scheduled }, id))) onremoved();
	}

	const path = (id: string) =>
		chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ');
	const amountOf = (entries: { amount: number }[]) =>
		entries.reduce((s, e) => s + Math.max(e.amount, 0), 0);
	const names = (ids: string[]) => ids.map((id) => personLabel(ledger.persons, id)).join(', ');
	const standing = (net: number) =>
		net > 0
			? `owes you ${formatAmount(net)}`
			: net < 0
				? `you owe ${formatAmount(-net)}`
				: 'settled';
	const plural = (n: number) => `${n} past ${n === 1 ? 'Transaction' : 'Transactions'}`;
</script>

<div class="min-w-0 space-y-6">
	{#if !person || !detail}
		<p class="text-sm text-gray-500">This Person no longer exists.</p>
	{:else}
		<header class="space-y-2">
			{#if renaming}
				<form onsubmit={rename} class="flex items-center gap-2">
					<input
						bind:value={name}
						aria-label="Name"
						class="rounded-lg border-gray-300 text-lg font-semibold"
					/>
					<button disabled={busy} class="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white"
						>Save</button
					>
					<button type="button" class="text-sm text-gray-500" onclick={() => (renaming = false)}
						>Cancel</button
					>
				</form>
			{:else}
				<div class="flex flex-wrap items-baseline gap-3">
					<h1 class="text-2xl font-semibold">
						{person.name}{#if person.archived}<span class="ml-2 text-sm text-gray-400"
								>archived</span
							>{/if}
					</h1>
					<button
						class="text-sm text-gray-500 hover:underline"
						onclick={() => {
							name = person.name;
							renaming = true;
						}}>Rename</button
					>
					<button
						class="text-sm text-gray-500 hover:underline"
						disabled={busy}
						onclick={() =>
							run(() =>
								planArchivePerson(ledger.persons, person.id, !person.archived, {
									now: new Date()
								})
							)}>{person.archived ? 'Unarchive' : 'Archive'}</button
					>
					{#if detail.accounts.length === 0 && detail.transactions.length === 0}
						<button class="text-sm text-red-600 hover:underline" disabled={busy} onclick={remove}
							>Delete</button
						>
					{/if}
				</div>
			{/if}
			{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
		</header>

		<div class="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
			<div class="space-y-6">
				<section class="grid grid-cols-3 gap-3 rounded-xl border bg-white p-4 text-sm">
					<div>
						<div class="text-xs text-gray-500">Owes you</div>
						<div class="tabular-nums">{formatAmount(detail.owesYou)}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500">You owe</div>
						<div class="tabular-nums">{formatAmount(detail.youOwe)}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500">Net</div>
						<div
							class="font-semibold tabular-nums {detail.net > 0
								? 'text-green-700'
								: detail.net < 0
									? 'text-amber-700'
									: ''}"
						>
							{standing(detail.net)}
						</div>
					</div>
				</section>

				<section>
					<h3 class="mb-1 text-sm font-semibold text-gray-500 uppercase">Linked Accounts</h3>
					{#if detail.accounts.length}
						<ul class="divide-y rounded-xl border bg-white">
							{#each detail.accounts as a (a.id)}
								<li class="flex items-baseline gap-3 px-4 py-2 text-sm">
									<a class="flex-1 hover:underline" href={resolve('/accounts/[id]', { id: a.id })}
										>{path(a.id)}</a
									>
									<span class="tabular-nums">{formatAmount(chart.balance(a.id))}</span>
								</li>
							{/each}
						</ul>
						<div class="mt-2 text-sm">
							{#if confirmFill}
								<span class="text-gray-700"
									>Add {person.name} to {plural(fill.length)}? Sides that already list someone stay
									as they are.</span
								>
								<button
									class="ml-2 rounded bg-gray-900 px-2 py-0.5 text-xs text-white"
									disabled={busy}
									onclick={async () => {
										const writes = fill;
										if (await run(() => writes)) confirmFill = false;
									}}>Fill</button
								>
								<button class="ml-1 text-xs text-gray-500" onclick={() => (confirmFill = false)}
									>Cancel</button
								>
							{:else if fill.length}
								<button
									class="rounded border px-2 py-0.5 text-xs hover:bg-gray-50"
									onclick={() => (confirmFill = true)}>Fill from links…</button
								>
								<span class="text-xs text-gray-500"
									>{plural(fill.length)} on these Accounts name nobody on that side.</span
								>
							{:else}
								<span class="text-xs text-gray-500"
									>Every past Transaction on these Accounts names someone.</span
								>
							{/if}
						</div>
					{:else}
						<p class="text-sm text-gray-500">
							No Accounts linked. Edit an Account and pick {person.name} as its Person.
						</p>
					{/if}
				</section>
			</div>

			<section>
				<h3 class="mb-1 text-sm font-semibold text-gray-500 uppercase">Transactions</h3>
				{#if detail.transactions.length}
					<ul class="divide-y rounded-xl border bg-white">
						{#each detail.transactions as tx (tx.id)}
							<li class="flex items-baseline gap-3 px-4 py-2 text-sm">
								<span class="w-24 text-gray-500">{tx.date ? shortDate(tx.date) : ''}</span>
								<a
									class="min-w-0 flex-1 truncate hover:underline"
									href={resolve('/transactions/[id]', { id: tx.id })}
									>{tx.description || '(no description)'}</a
								>
								<span class="text-xs text-violet-700"
									>{names(tx.fromPersons) || '—'} → {names(tx.toPersons) || '—'}</span
								>
								<span class="w-28 text-right tabular-nums"
									>{formatAmount(amountOf(tx.entries))}</span
								>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-sm text-gray-500">No Transactions name {person.name} yet.</p>
				{/if}
			</section>
		</div>
	{/if}
</div>
