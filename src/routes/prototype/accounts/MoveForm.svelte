<script lang="ts">
	// PROTOTYPE — move Account to a new parent (same Account Type; Groups or empty Leaves only).
	import { byId, moveTargets, pathOf, moveAccount } from './data.svelte';
	let { accountId, onclose }: { accountId: string; onclose: () => void } = $props();
	const acc = byId(accountId);
	const targets = moveTargets(accountId);
	let dest = $state(targets[0]?.id ?? '');
</script>

<div class="space-y-4 text-sm">
	<h2 class="text-lg font-semibold">Move {acc.name}</h2>
	{#if targets.length === 0}
		<p class="text-gray-500">No valid destinations (same type, Group or empty Leaf).</p>
	{:else}
		<select bind:value={dest} class="w-full rounded border-gray-300 text-sm">
			{#each targets as t (t.id)}
				<option value={t.id}>{pathOf(t.id).map((x) => x.name).join(' › ')}</option>
			{/each}
		</select>
		<p class="text-xs text-gray-500">Moves {acc.name} and everything under it. Leaves holding money are not offered.</p>
	{/if}
	<div class="flex justify-end gap-2">
		<button onclick={onclose} class="rounded px-3 py-1.5 hover:bg-gray-100">Cancel</button>
		<button
			disabled={!dest}
			onclick={() => {
				moveAccount(accountId, dest);
				onclose();
			}}
			class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40">Move</button
		>
	</div>
</div>
