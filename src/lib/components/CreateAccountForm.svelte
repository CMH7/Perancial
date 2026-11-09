<script lang="ts">
	// Create an Account, optionally with one level of child rows. Rules come from the domain module.
	import {
		ACCOUNT_TYPE_GUIDE,
		CreateAccountForm,
		createFormRules,
		formatAmount,
		parseAmount,
		planCreateAccount
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let {
		parentId: initialParent,
		onclose,
		oncreated
	}: {
		parentId: string;
		onclose: () => void;
		/** Called after saving; `groupId` is set when a Leaf Account was converted into a Group. */
		oncreated: (groupId: string | null) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let parentId = $state(initialParent);
	let name = $state('');
	let description = $state('');
	let openingBalance = $state('');
	let children = $state<{ name: string; description: string; openingBalance: string }[]>([]);
	let errors = $state<Record<string, string>>({});
	let saveError = $state('');
	let saving = $state(false);

	const chart = $derived(ledger.chart);
	const rules = $derived(createFormRules(chart, parentId, children.length));
	const parent = $derived(chart.account(parentId));
	const guide = $derived(ACCOUNT_TYPE_GUIDE.find((g) => g.type === parent?.type));
	const childSum = $derived(
		children.reduce((sum, row) => sum + (parseAmount(row.openingBalance) ?? 0), 0)
	);
	const parentOptions = $derived(
		ledger.accounts
			.filter((a) => !a.archived && a.system !== 'opening-balances')
			.map((a) => ({
				id: a.id,
				label: chart
					.path(a.id)
					.map((p) => p.name)
					.join(' › '),
				rank: ACCOUNT_TYPE_GUIDE.findIndex((g) => g.type === a.type)
			}))
			.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
	);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		saveError = '';
		const parsed = CreateAccountForm.safeParse({
			parentId,
			name,
			description,
			openingBalance: rules.opening.kind === 'editable' ? openingBalance : '',
			children: rules.childRowsAllowed ? children : []
		});
		if (!parsed.success) {
			errors = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
			return;
		}
		errors = {};
		saving = true;
		try {
			const writes = planCreateAccount(chart, parsed.data, {
				newId: () => ledger.newAccountId(),
				now: new Date()
			});
			await ledger.commit(writes);
			// After a conversion the page's Account became the new child; show the new Group instead.
			oncreated(rules.confirm ? writes[0].id : null);
		} catch (err) {
			saveError = `Could not save: ${(err as Error).message}`;
		} finally {
			saving = false;
		}
	}
</script>

<form onsubmit={submit} class="space-y-4 text-sm" novalidate>
	<h2 class="text-lg font-semibold">New account</h2>

	<label class="block">
		<span class="text-gray-600">Parent</span>
		<select bind:value={parentId} class="mt-1 w-full rounded border-gray-300 text-sm">
			{#each parentOptions as option (option.id)}
				<option value={option.id}>{option.label}</option>
			{/each}
		</select>
		{#if guide}
			<span class="mt-1 block text-xs text-gray-500"
				>{guide.label}: {guide.what} e.g. {guide.examples}</span
			>
		{/if}
	</label>

	{#if rules.confirm}
		<p class="rounded-lg bg-amber-50 p-3 text-amber-900">{rules.confirm}</p>
	{/if}

	<label class="block">
		<span class="text-gray-600">Name</span>
		<input bind:value={name} class="mt-1 w-full rounded border-gray-300 text-sm" />
		{#if errors.name}<span class="text-xs text-red-600">{errors.name}</span>{/if}
	</label>

	<label class="block">
		<span class="text-gray-600">Description</span>
		<input bind:value={description} class="mt-1 w-full rounded border-gray-300 text-sm" />
	</label>

	{#if rules.opening.kind !== 'hidden'}
		<label class="block">
			<span class="text-gray-600">Opening Balance</span>
			{#if rules.opening.kind === 'editable'}
				<input
					bind:value={openingBalance}
					inputmode="decimal"
					placeholder="0.00"
					class="mt-1 w-full rounded border-gray-300 text-right text-sm tabular-nums"
				/>
				{#if errors.openingBalance}
					<span class="text-xs text-red-600">{errors.openingBalance}</span>
				{:else}
					<span class="text-xs text-gray-500"
						>Amount before your first transaction. For money you owe, enter it as positive.</span
					>
				{/if}
			{:else}
				<input
					disabled
					value={formatAmount(rules.opening.kind === 'sum' ? childSum : rules.opening.amount)}
					class="mt-1 w-full rounded border-gray-300 bg-gray-100 text-right text-sm tabular-nums"
				/>
				<span class="text-xs text-gray-500">
					{rules.opening.kind === 'sum'
						? 'Sum of the child accounts.'
						: `Inherited from "${parent?.name}".`}
				</span>
			{/if}
		</label>
	{/if}

	{#if rules.childRowsAllowed}
		<div class="space-y-2">
			{#each children as row, i (i)}
				<div class="rounded-lg bg-gray-50 p-2">
					<div class="grid grid-cols-[1fr_1fr_8rem_auto] gap-2">
						<input
							bind:value={row.name}
							placeholder="Child name"
							aria-label="Child name"
							class="rounded border-gray-300 text-sm"
						/>
						<input
							bind:value={row.description}
							placeholder="Description"
							aria-label="Child description"
							class="rounded border-gray-300 text-sm"
						/>
						{#if rules.opening.kind !== 'hidden'}
							<input
								bind:value={row.openingBalance}
								placeholder="0.00"
								inputmode="decimal"
								aria-label="Child opening balance"
								class="rounded border-gray-300 text-right text-sm tabular-nums"
							/>
						{:else}
							<span></span>
						{/if}
						<button
							type="button"
							onclick={() => children.splice(i, 1)}
							aria-label="Remove child row"
							class="px-2 text-gray-400 hover:text-red-600">✕</button
						>
					</div>
					{#each [errors[`children.${i}.name`], errors[`children.${i}.openingBalance`]].filter(Boolean) as message (message)}
						<p class="mt-1 text-xs text-red-600">{message}</p>
					{/each}
				</div>
			{/each}
			<button
				type="button"
				onclick={() => children.push({ name: '', description: '', openingBalance: '' })}
				class="text-blue-600 hover:underline">+ Add child account</button
			>
		</div>
	{/if}

	{#if saveError}<p class="text-red-600">{saveError}</p>{/if}

	<div class="flex justify-end gap-2 pt-2">
		<button type="button" onclick={onclose} class="rounded px-3 py-1.5 hover:bg-gray-100"
			>Cancel</button
		>
		<button
			disabled={saving}
			class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50"
		>
			{saving ? 'Saving…' : rules.confirm ? 'Move money and create' : 'Create'}
		</button>
	</div>
</form>
