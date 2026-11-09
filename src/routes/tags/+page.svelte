<script lang="ts">
	// Tags: every tag with how many Transactions use it. Rename (renaming onto an existing tag
	// merges the two) and remove, across every Transaction.
	import ConfirmAction from '#lib/components/ConfirmAction.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import { normalizeTag, planRemoveTag, planRenameTag, tagCounts } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const chart = $derived(ledger.chart);
	const tags = $derived(tagCounts(chart));
	const used = (n: number) => `${n} ${n === 1 ? 'Transaction' : 'Transactions'}`;

	let editing = $state<string | null>(null);
	let newName = $state('');
	let error = $state('');
	let busy = $state(false);
	let removing = $state<string | null>(null);

	const target = $derived(normalizeTag(newName));
	const merges = $derived(!!target && target !== editing && tags.some((t) => t.tag === target));

	function startRename(tag: string) {
		editing = tag;
		newName = tag;
		error = '';
	}

	async function rename(e: SubmitEvent) {
		e.preventDefault();
		if (!editing) return;
		error = '';
		busy = true;
		try {
			await ledger.commitInBatches(planRenameTag(chart, editing, newName, { now: new Date() }));
			editing = null;
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<main class="mx-auto max-w-2xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your tags…</p>
	{:else}
		<h1 class="mb-1 text-2xl font-semibold">Tags</h1>
		<p class="mb-4 text-sm text-gray-500">
			Tags gather Transactions across Accounts: a trip, an event, a project. Rename a tag onto
			another to merge them.
		</p>

		{#if tags.length === 0}
			<p class="rounded-xl border bg-white px-5 py-8 text-center text-sm text-gray-500">
				No tags yet. Add them on the Transaction form.
			</p>
		{:else}
			<ul class="divide-y rounded-xl border bg-white text-sm">
				{#each tags as { tag, count } (tag)}
					<li class="px-5 py-3">
						{#if editing === tag}
							<form onsubmit={rename} class="flex flex-wrap items-center gap-2">
								<span class="text-gray-400">#</span>
								<!-- svelte-ignore a11y_autofocus -->
								<input
									bind:value={newName}
									autofocus
									aria-label="New name for #{tag}"
									class="min-w-0 flex-1 rounded border-gray-300 py-1 text-sm"
								/>
								<button
									disabled={busy}
									class="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-40"
									>{merges ? 'Merge' : 'Rename'}</button
								>
								<button type="button" class="px-2 text-gray-500" onclick={() => (editing = null)}
									>Cancel</button
								>
								{#if merges}
									<p class="w-full text-xs text-amber-700">
										#{target} already exists: its Transactions and #{tag}'s will share it.
									</p>
								{:else if target && target !== newName.trim()}
									<p class="w-full text-xs text-gray-500">Saved as #{target}</p>
								{/if}
								{#if error}<p class="w-full text-xs text-red-600">{error}</p>{/if}
							</form>
						{:else}
							<div class="flex items-center justify-between gap-2">
								<div>
									<span class="font-medium">#{tag}</span>
									<span class="ml-2 text-xs text-gray-500">{used(count)}</span>
								</div>
								<div class="flex gap-1 text-xs">
									<button
										class="rounded px-2 py-1 text-gray-600 hover:bg-gray-100"
										onclick={() => startRename(tag)}>Rename</button
									>
									<button
										class="rounded px-2 py-1 text-red-700 hover:bg-red-50"
										onclick={() => (removing = tag)}>Remove</button
									>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</main>

{#if removing}
	{@const count = tags.find((t) => t.tag === removing)?.count ?? 0}
	<Modal onclose={() => (removing = null)}>
		<ConfirmAction
			title="Remove #{removing}"
			check={{ allowed: true, inside: 0 }}
			question="Take #{removing} off {used(count)}? The Transactions stay; only the tag goes."
			confirmLabel="Remove"
			danger
			onclose={() => (removing = null)}
			onconfirm={async () => {
				await ledger.commitInBatches(planRemoveTag(chart, removing!, { now: new Date() }));
				removing = null;
			}}
		/>
	</Modal>
{/if}
