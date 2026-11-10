<script lang="ts">
	// Move an Account (and everything under it) to another parent of the same type.
	import { moveTargets, planMoveAccount } from '#lib/domain/index.ts';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from './AccountPicker.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';

	let { accountId, onclose }: { accountId: string; onclose: () => void } = $props();

	const chart = $derived(ledger.chart);
	const account = $derived(chart.account(accountId));
	const label = (id: string) =>
		chart
			.path(id)
			.map((p) => p.name)
			.join(' › ');
	const targets = $derived(
		moveTargets(chart, accountId)
			.map((t) => ({ id: t.id, label: label(t.id) }))
			.sort((a, b) => a.label.localeCompare(b.label))
	);

	let destId = $state('');
	let error = $state('');
	let saving = $state(false);
	$effect(() => {
		if (!destId && targets.length) destId = targets[0].id;
	});

	async function move() {
		error = '';
		saving = true;
		try {
			await ledger.commit(planMoveAccount(chart, accountId, destId, { now: new Date() }));
			onclose();
		} catch (err) {
			error = `Could not move: ${(err as Error).message}`;
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-4 text-sm">
	<h2 class="text-lg font-semibold">Move {account?.name}</h2>
	{#if targets.length === 0}
		<p class="text-gray-600">
			Nowhere to move it. It can only go under a group of the same type, or an account with no money
			recorded on it.
		</p>
	{:else}
		<label class="block">
			<span class="text-gray-600">New parent</span>
			<AccountPicker
				bind:value={destId}
				items={accountItems.for(targets.map((t) => t.id))}
				label="New parent"
				placeholder="Choose a Group…"
				showBalance={false}
				class="mt-1 w-full"
			/>
		</label>
		<p class="text-xs text-gray-500">
			Everything inside {account?.name} moves with it. Accounts holding money directly aren't offered.
		</p>
	{/if}
	{#if error}<p class="text-red-600">{error}</p>{/if}
	<div class="flex justify-end gap-2">
		<button type="button" onclick={onclose} class="rounded px-3 py-1.5 hover:bg-gray-100"
			>Cancel</button
		>
		{#if targets.length}
			<button
				onclick={move}
				disabled={saving || !destId}
				class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50"
				>{saving ? 'Moving…' : 'Move'}</button
			>
		{/if}
	</div>
</div>
