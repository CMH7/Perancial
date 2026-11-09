<script lang="ts">
	// PROTOTYPE — add/edit Account form, shared by all variants (each variant hosts it differently).
	import {
		db,
		TYPE_HELP,
		byId,
		isGroup,
		hasEntries,
		takesOpening,
		balance,
		pathOf,
		fmt,
		parseAmount,
		createAccount,
		updateAccount
	} from './data.svelte';

	let {
		mode,
		parentId = 'asset',
		accountId,
		onclose
	}: { mode: 'create' | 'edit'; parentId?: string; accountId?: string; onclose: () => void } = $props();

	const editing = mode === 'edit' ? byId(accountId!) : undefined;

	let parentSel = $state(parentId);
	let name = $state(editing?.name ?? '');
	let description = $state(editing?.description ?? '');
	let openingStr = $state(editing ? (editing.opening / 100).toFixed(2) : '');
	let rows = $state<{ name: string; description: string; openingStr: string }[]>([]);

	const parentOptions = $derived(
		db.accounts.filter((a) => !a.archived && a.system !== 'opening-balances')
	);
	const parent = $derived(byId(parentSel));
	const type = $derived(editing ? editing.type : parent.type);
	const showOpening = $derived(takesOpening(type));
	const inheritCase = $derived(mode === 'create' && !isGroup(parent) && hasEntries(parent));
	const isRoot = editing?.system === 'root';
	const editGroup = $derived(editing ? isGroup(editing) : false);
	const childSum = $derived(rows.reduce((s, r) => s + parseAmount(r.openingStr), 0));

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!isRoot && !name.trim()) return alert('Name is required');
		if (mode === 'edit') {
			updateAccount(editing!.id, { name, description, opening: parseAmount(openingStr) });
			return onclose();
		}
		if (
			inheritCase &&
			!confirm(
				`"${parent.name}" has ${fmt(balance(parent.id))} recorded directly. It will move to the new child "${name}", and "${parent.name}" becomes a Group Account.`
			)
		)
			return;
		createAccount({
			parentId: parentSel,
			name,
			description,
			opening: parseAmount(openingStr),
			children: rows
				.filter((r) => r.name.trim())
				.map((r) => ({ name: r.name, description: r.description, opening: parseAmount(r.openingStr) }))
		});
		onclose();
	}
</script>

<form onsubmit={submit} class="space-y-4 text-sm">
	<h2 class="text-lg font-semibold">
		{mode === 'create' ? 'New account' : `Edit ${editing?.name}`}
	</h2>

	{#if mode === 'create'}
		<label class="block">
			<span class="text-gray-600">Parent</span>
			<select bind:value={parentSel} class="mt-1 w-full rounded border-gray-300 text-sm">
				{#each parentOptions as p (p.id)}
					<option value={p.id}>{pathOf(p.id).map((x) => x.name).join(' › ')}</option>
				{/each}
			</select>
			<span class="text-xs text-gray-500">Type: {type} (inherited from parent). {TYPE_HELP[type].what} e.g. {TYPE_HELP[type].examples}</span>
		</label>
	{/if}

	<label class="block">
		<span class="text-gray-600">Name</span>
		<input bind:value={name} disabled={isRoot} class="mt-1 w-full rounded border-gray-300 text-sm disabled:bg-gray-100" />
	</label>
	<label class="block">
		<span class="text-gray-600">Description</span>
		<input bind:value={description} class="mt-1 w-full rounded border-gray-300 text-sm" />
	</label>

	{#if showOpening && !isRoot}
		<label class="block">
			<span class="text-gray-600">Opening Balance</span>
			{#if inheritCase}
				<input disabled value={fmt(balance(parent.id))} class="mt-1 w-full rounded border-gray-300 bg-gray-100 text-sm" />
				<span class="text-xs text-amber-700">Inherited from "{parent.name}", which becomes a Group Account.</span>
			{:else if rows.length > 0}
				<input disabled value={fmt(childSum)} class="mt-1 w-full rounded border-gray-300 bg-gray-100 text-sm" />
				<span class="text-xs text-gray-500">Sum of child accounts.</span>
			{:else if editGroup}
				<input disabled value={fmt(balance(editing!.id))} class="mt-1 w-full rounded border-gray-300 bg-gray-100 text-sm" />
				<span class="text-xs text-gray-500">Group Account: sum of its children.</span>
			{:else}
				<input bind:value={openingStr} placeholder="0.00" inputmode="decimal" class="mt-1 w-full rounded border-gray-300 text-right text-sm tabular-nums" />
				<span class="text-xs text-gray-500">Amount before the first Transaction. Liabilities: amount owed, positive.</span>
			{/if}
		</label>
	{:else if !isRoot}
		<p class="text-xs text-gray-500">{type} accounts start at zero (no Opening Balance).</p>
	{/if}

	{#if mode === 'create' && !inheritCase}
		<div class="space-y-2">
			{#each rows as r, i (i)}
				<div class="grid grid-cols-[1fr_1fr_8rem_auto] gap-2 rounded bg-gray-50 p-2">
					<input bind:value={r.name} placeholder="Child name" class="rounded border-gray-300 text-sm" />
					<input bind:value={r.description} placeholder="Description" class="rounded border-gray-300 text-sm" />
					{#if showOpening}
						<input bind:value={r.openingStr} placeholder="0.00" class="rounded border-gray-300 text-right text-sm tabular-nums" />
					{:else}
						<span></span>
					{/if}
					<button type="button" onclick={() => rows.splice(i, 1)} class="px-2 text-gray-400 hover:text-red-600">✕</button>
				</div>
			{/each}
			<button
				type="button"
				onclick={() => rows.push({ name: '', description: '', openingStr: '' })}
				class="text-blue-600 hover:underline">+ Add child account</button
			>
		</div>
	{/if}

	<div class="flex justify-end gap-2 pt-2">
		<button type="button" onclick={onclose} class="rounded px-3 py-1.5 hover:bg-gray-100">Cancel</button>
		<button class="rounded bg-gray-900 px-3 py-1.5 text-white">Save</button>
	</div>
</form>
