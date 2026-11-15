<script lang="ts">
	// Persons: the list in the left pane, each with where the owner stands with them, beside the
	// open Person or the overview.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PaneStrip from '#lib/components/PaneStrip.svelte';
	import PaneToggle from '#lib/components/PaneToggle.svelte';
	import SplitPane from '#lib/components/SplitPane.svelte';
	import { formatAmount, netPosition, planSavePerson } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let { children } = $props();
	let collapsed = $state(false);
	let show = $state<'active' | 'archived'>('active');
	let q = $state('');
	let name = $state('');
	let error = $state('');

	const chart = $derived(ledger.chart);
	const lines = $derived(
		ledger.persons
			.toSorted((a, b) => a.name.localeCompare(b.name))
			.map((p) => ({ person: p, net: netPosition(chart, p.id).net }))
	);
	const shown = $derived(
		lines.filter(
			({ person }) =>
				person.archived === (show === 'archived') &&
				person.name.toLowerCase().includes(q.trim().toLowerCase())
		)
	);
	const archived = $derived(lines.filter((l) => l.person.archived).length);
	const openId = $derived(page.params.id);
	const SHOW = [
		['active', 'Active', () => lines.length - archived],
		['archived', 'Archived', () => archived]
	] as const;

	async function add(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		try {
			const id = ledger.newPersonId();
			await ledger.commit(planSavePerson(ledger.persons, { id, name }, { now: new Date() }));
			name = '';
			show = 'active';
			goto(resolve('/persons/[id]', { id }));
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

<SplitPane storageKey="perancial.persons.paneCollapsed" bind:collapsed>
	{#snippet pane()}
		{#if collapsed}
			<PaneStrip
				bind:collapsed
				label="persons"
				tabs={SHOW.map(([key, label]) => ({
					key,
					short: label.slice(0, 3),
					title: `${label} Persons`,
					active: show === key,
					onclick: () => {
						show = key;
						collapsed = false;
					}
				}))}
			/>
		{:else}
			<section class="flex h-full min-h-0 flex-col border-r bg-white">
				<nav aria-label="Person status" class="flex border-b px-2">
					{#each SHOW as [key, label, count] (key)}
						<button
							onclick={() => (show = key)}
							aria-pressed={show === key}
							class="-mb-px flex-1 border-b-2 px-1 py-2.5 text-center text-xs {show === key
								? 'border-gray-900 font-semibold text-gray-900'
								: 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900'}"
							>{label} <span class="text-gray-400">{count()}</span></button
						>
					{/each}
				</nav>

				<div class="grid gap-2 border-b p-3">
					<div class="flex items-center gap-2 px-1">
						<a href={resolve('/persons')} class="text-sm font-semibold hover:underline">Persons</a>
						<span class="text-xs text-gray-400">{shown.length} of {lines.length}</span>
						<span class="ml-auto"></span>
						<PaneToggle bind:collapsed label="persons" />
					</div>
					<form onsubmit={add} class="flex gap-2">
						<input
							bind:value={name}
							placeholder="New Person's name"
							aria-label="New Person's name"
							class="min-w-0 flex-1 rounded-lg border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
						/>
						<button class="rounded-md bg-gray-900 px-2 py-0.5 text-xs text-white">+ Add</button>
					</form>
					{#if error}<p class="px-1 text-xs text-red-600">{error}</p>{/if}
					<input
						type="search"
						bind:value={q}
						placeholder="Search names…"
						aria-label="Search Persons"
						class="w-full rounded-lg border-gray-200 bg-gray-50 px-3 py-1.5 text-sm"
					/>
				</div>

				<ul class="min-h-0 flex-1 overflow-y-auto py-2">
					{#if !ledger.ready}
						<li class="px-4 py-6 text-center text-sm text-gray-500">Loading…</li>
					{:else}
						{#each shown as { person, net } (person.id)}
							<li>
								<a
									href={resolve('/persons/[id]', { id: person.id })}
									aria-current={person.id === openId ? 'page' : undefined}
									class="flex items-baseline gap-3 border-l-2 px-4 py-2 text-sm {person.id ===
									openId
										? 'border-gray-900 bg-gray-100'
										: 'border-transparent hover:bg-gray-50'}"
								>
									<span class="min-w-0 flex-1 truncate font-medium text-gray-900"
										>{person.name}</span
									>
									<span
										class="text-xs tabular-nums {net > 0
											? 'text-green-700'
											: net < 0
												? 'text-amber-700'
												: 'text-gray-400'}">{standing(net)}</span
									>
								</a>
							</li>
						{:else}
							<li class="px-4 py-6 text-center text-sm text-gray-500">
								{lines.length ? 'No Persons match.' : 'No Persons yet.'}
							</li>
						{/each}
					{/if}
				</ul>
			</section>
		{/if}
	{/snippet}

	{@render children()}
</SplitPane>
