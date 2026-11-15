<script lang="ts">
	// Settings → Persons: every Person with where the owner stands with them, an add box, and the
	// picked Person's page beside the list. The pick lives in the URL (`?person=`).
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatAmount, netPosition, planSavePerson } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import PersonDetail from './PersonDetail.svelte';

	let showArchived = $state(false);
	let name = $state('');
	let error = $state('');

	const chart = $derived(ledger.chart);
	const lines = $derived(
		ledger.persons
			.filter((p) => showArchived || !p.archived)
			.toSorted((a, b) => a.name.localeCompare(b.name))
			.map((p) => ({ person: p, net: netPosition(chart, p.id).net }))
	);
	const archivedCount = $derived(ledger.persons.filter((p) => p.archived).length);
	const openId = $derived(page.url.searchParams.get('person'));

	function pick(id: string | null) {
		const url = new URL(page.url.href);
		if (id) url.searchParams.set('person', id);
		else url.searchParams.delete('person');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, query only
		goto(url, { replaceState: true });
	}

	async function add(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		try {
			const id = ledger.newPersonId();
			await ledger.commit(planSavePerson(ledger.persons, { id, name }, { now: new Date() }));
			name = '';
			pick(id);
		} catch (err) {
			error = (err as Error).message;
		}
	}

	const standing = (net: number) =>
		net > 0
			? `owes you ${formatAmount(net)}`
			: net < 0
				? `you owe ${formatAmount(-net)}`
				: 'settled';
</script>

<p class="mb-4 max-w-2xl text-sm text-gray-600">
	The people in your Transactions. Link a Person to the Accounts that track money between you (edit
	the Account), and their page shows who owes whom.
</p>
<div class="grid gap-6 md:grid-cols-[18rem_1fr]">
	<section class="space-y-3">
		<form onsubmit={add} class="space-y-1">
			<div class="flex gap-2">
				<input
					bind:value={name}
					placeholder="Name"
					aria-label="New Person's name"
					class="min-w-0 flex-1 rounded-lg border-gray-300 text-sm"
				/>
				<button class="rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white">Add</button>
			</div>
			{#if error}<p class="text-xs text-red-600">{error}</p>{/if}
		</form>
		<ul class="divide-y rounded-xl border bg-white">
			{#each lines as { person, net } (person.id)}
				<li>
					<button
						onclick={() => pick(person.id)}
						aria-current={person.id === openId ? 'true' : undefined}
						class="flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm {person.id ===
						openId
							? 'bg-gray-100'
							: 'hover:bg-gray-50'}"
					>
						<span class="min-w-0 flex-1 truncate font-medium"
							>{person.name}{#if person.archived}<span class="text-xs text-gray-400">
									(archived)</span
								>{/if}</span
						>
						<span
							class="text-xs tabular-nums {net > 0
								? 'text-green-700'
								: net < 0
									? 'text-amber-700'
									: 'text-gray-400'}">{standing(net)}</span
						>
					</button>
				</li>
			{:else}
				<li class="px-4 py-6 text-center text-sm text-gray-500">
					{archivedCount ? 'Every Person is archived.' : 'No Persons yet.'}
				</li>
			{/each}
		</ul>
		{#if archivedCount}
			<label class="flex items-center gap-2 text-xs text-gray-600">
				<input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived ({archivedCount})
			</label>
		{/if}
	</section>

	{#if openId}
		<PersonDetail personId={openId} onremoved={() => pick(null)} />
	{:else}
		<p class="text-sm text-gray-500">Pick a Person to see their Accounts and Transactions.</p>
	{/if}
</div>
