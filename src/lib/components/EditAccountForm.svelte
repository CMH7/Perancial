<script lang="ts">
	// Edit an Account's name, description, and Opening Balance. Rules come from the domain module.
	import {
		EditAccountForm,
		editFormRules,
		formatAmount,
		planEditAccount
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let { accountId, onclose }: { accountId: string; onclose: () => void } = $props();

	const chart = $derived(ledger.chart);
	const account = $derived(chart.account(accountId));
	const rules = $derived(editFormRules(chart, accountId));

	// Start from the saved values; the form keeps its own copy while open.
	// svelte-ignore state_referenced_locally
	const start = { account: chart.account(accountId), rules: editFormRules(chart, accountId) };
	let name = $state(start.account?.name ?? '');
	let description = $state(start.account?.description ?? '');
	let openingBalance = $state(
		start.rules.opening.kind === 'editable' && start.rules.opening.current !== 0
			? formatAmount(start.rules.opening.current).replace('₱', '')
			: ''
	);
	let errors = $state<Record<string, string>>({});
	let saveError = $state('');
	let saving = $state(false);

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		saveError = '';
		const parsed = EditAccountForm.safeParse({
			name,
			description,
			openingBalance: rules.opening.kind === 'editable' ? openingBalance : ''
		});
		if (!parsed.success) {
			errors = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message]));
			return;
		}
		errors = {};
		saving = true;
		try {
			await ledger.commit(planEditAccount(chart, accountId, parsed.data, { now: new Date() }));
			onclose();
		} catch (err) {
			saveError = `Could not save: ${(err as Error).message}`;
		} finally {
			saving = false;
		}
	}
</script>

<form onsubmit={submit} class="space-y-4 text-sm" novalidate>
	<h2 class="text-lg font-semibold">Edit {account?.name}</h2>

	<label class="block">
		<span class="text-gray-600">Name</span>
		<input
			bind:value={name}
			disabled={!rules.nameEditable}
			class="mt-1 w-full rounded border-gray-300 text-sm disabled:bg-gray-100"
		/>
		{#if !rules.nameEditable}
			<span class="text-xs text-gray-500">Root Accounts keep their name.</span>
		{:else if errors.name}
			<span class="text-xs text-red-600">{errors.name}</span>
		{/if}
	</label>

	<label class="block">
		<span class="text-gray-600">Description</span>
		<input bind:value={description} class="mt-1 w-full rounded border-gray-300 text-sm" />
	</label>

	{#if rules.opening.kind === 'editable'}
		<label class="block">
			<span class="text-gray-600">Opening Balance</span>
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
		</label>
	{:else if rules.opening.kind === 'sum'}
		<label class="block">
			<span class="text-gray-600">Balance</span>
			<input
				disabled
				value={formatAmount(rules.opening.amount)}
				class="mt-1 w-full rounded border-gray-300 bg-gray-100 text-right text-sm tabular-nums"
			/>
			<span class="text-xs text-gray-500">Group Account: the sum of its children.</span>
		</label>
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
			{saving ? 'Saving…' : 'Save'}
		</button>
	</div>
</form>
