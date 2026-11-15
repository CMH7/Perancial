<script lang="ts">
	// Create an Account, optionally with one level of child rows. Rules come from the domain module.
	// With `preview`, a live card (or the Group's child cards) sits above the fields.
	import {
		ACCOUNT_TYPE_GUIDE,
		CreateAccountForm,
		createFormRules,
		formatAmount,
		newLeafIds,
		parseAmount,
		planCreateAccount,
		type AccountType
	} from '#lib/domain/index.ts';
	import { tick } from 'svelte';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from './AccountPicker.svelte';
	import AccountPersonField from './AccountPersonField.svelte';
	import CardTermsFields from './CardTermsFields.svelte';
	import WalletCard from './WalletCard.svelte';
	import { ledger } from '#lib/ledger.svelte.ts';

	let {
		parentId: initialParent,
		name: initialName = '',
		types,
		preview = false,
		title = 'New account',
		onclose,
		oncreated
	}: {
		parentId: string;
		name?: string;
		/** Only offer parents of these Account Types. */
		types?: AccountType[];
		preview?: boolean;
		/** Heading; null leaves it to the surrounding drawer. */
		title?: string | null;
		onclose: () => void;
		/**
		 * Called after saving. `groupId` is set when a Leaf Account was converted into a Group;
		 * `leafIds` are the Leaf Accounts the save left behind (the new Account or its children).
		 */
		oncreated: (groupId: string | null, leafIds: string[]) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let parentId = $state(initialParent);
	// svelte-ignore state_referenced_locally
	let name = $state(initialName);
	let description = $state('');
	let openingBalance = $state('');
	let children = $state<{ name: string; description: string; openingBalance: string }[]>([]);
	let isCard = $state(false);
	let statementDay = $state('');
	let dueDay = $state('');
	let personId = $state<string | null>(null);
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
			.filter(
				(a) => !a.archived && a.system !== 'opening-balances' && (!types || types.includes(a.type))
			)
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

	// The preview: Asset and Liability Leaves are drawn as cards.
	const cards = $derived(parent?.type === 'asset' || parent?.type === 'liability');
	const parentPath = $derived(
		chart
			.path(parentId)
			.slice(1)
			.map((p) => p.name)
			.join(' › ')
	);
	const shownName = $derived(name.trim() || 'New account');
	const withChildren = $derived(rules.childRowsAllowed && children.length > 0);
	const singleBalance = $derived(
		rules.opening.kind === 'inherited' ? rules.opening.amount : (parseAmount(openingBalance) ?? 0)
	);

	let rowsEl: HTMLDivElement | undefined = $state();
	async function addChild() {
		children.push({ name: '', description: '', openingBalance: '' });
		await tick();
		rowsEl?.querySelector<HTMLInputElement>('[data-row]:last-of-type input')?.focus();
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		saveError = '';
		const parsed = CreateAccountForm.safeParse({
			parentId,
			name,
			description,
			openingBalance: rules.opening.kind === 'editable' ? openingBalance : '',
			children: rules.childRowsAllowed ? children : [],
			card: rules.card && isCard ? { statementDay, dueDay } : null,
			personId
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
			oncreated(rules.confirm ? writes[0].id : null, newLeafIds(writes));
		} catch (err) {
			saveError = `Could not save: ${(err as Error).message}`;
		} finally {
			saving = false;
		}
	}
</script>

<form onsubmit={submit} class="space-y-4 text-sm" novalidate>
	{#if title}<h2 class="text-lg font-semibold">{title}</h2>{/if}

	{#if preview && cards && parent}
		<div class="-mx-4 -mt-4 border-b bg-gray-50 px-4 py-5">
			{#if withChildren}
				<p class="mb-3 text-xs text-gray-500">
					<b class="text-gray-800">{shownName}</b> becomes a Group{parentPath
						? ` in ${parentPath}`
						: ''}. Its {children.length === 1 ? 'child is a card' : 'children are cards'}:
				</p>
				<div class="grid grid-cols-2 gap-3">
					{#each children as row, i (i)}
						<WalletCard
							name={row.name.trim() || `Child ${i + 1}`}
							path={parentPath ? `${parentPath} › ${shownName}` : shownName}
							type={parent.type}
							balance={parseAmount(row.openingBalance) ?? 0}
							compact
							tag="New"
						/>
					{/each}
				</div>
			{:else}
				<div class="mx-auto w-64">
					<WalletCard
						name={shownName}
						path={parentPath}
						type={parent.type}
						balance={singleBalance}
						tag="New"
					/>
				</div>
			{/if}
		</div>
	{/if}

	<label class="block">
		<span class="text-gray-600">{preview ? 'Inside' : 'Parent'}</span>
		<AccountPicker
			bind:value={parentId}
			items={accountItems.for(parentOptions.map((o) => o.id))}
			label="Parent"
			placeholder="Choose a Group…"
			showBalance={false}
			creatable={false}
			class="mt-1 w-full"
		/>
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
		<!-- svelte-ignore a11y_autofocus -->
		<input
			bind:value={name}
			autofocus={!!initialName || preview}
			class="mt-1 w-full rounded border-gray-300 text-sm"
		/>
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

	<AccountPersonField bind:value={personId} inherited={rules.person.inherited} />

	{#if rules.card}
		<CardTermsFields bind:enabled={isCard} bind:statementDay bind:dueDay {errors} />
	{/if}

	{#if rules.childRowsAllowed}
		<div class="space-y-2">
			{#if preview}
				<div>
					<div class="flex items-baseline justify-between">
						<span class="text-gray-600">Child accounts</span>
						<span class="text-xs text-gray-400">optional</span>
					</div>
					<p class="text-xs text-gray-500">
						For one bank with several accounts (Savings, Checking…): each child is its own card,
						grouped under {name.trim() || 'this name'}.
					</p>
				</div>
			{/if}
			<div bind:this={rowsEl} class="space-y-2">
				{#each children as row, i (i)}
					<div data-row class="rounded-lg bg-gray-50 p-2">
						<div class="grid grid-cols-[1fr_1fr_8rem_auto] gap-2">
							<input
								bind:value={row.name}
								placeholder="Child name"
								aria-label="Child name"
								class="min-w-0 rounded border-gray-300 text-sm"
							/>
							<input
								bind:value={row.description}
								placeholder="Description"
								aria-label="Child description"
								class="min-w-0 rounded border-gray-300 text-sm"
							/>
							{#if rules.opening.kind !== 'hidden'}
								<input
									bind:value={row.openingBalance}
									placeholder="0.00"
									inputmode="decimal"
									aria-label="Child opening balance"
									class="min-w-0 rounded border-gray-300 text-right text-sm tabular-nums"
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
			</div>
			<button type="button" onclick={addChild} class="text-blue-600 hover:underline"
				>+ Add child account</button
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
			{saving
				? 'Saving…'
				: rules.confirm
					? 'Move money and create'
					: withChildren
						? `Create Group and ${children.length} ${children.length === 1 ? 'account' : 'accounts'}`
						: 'Create'}
		</button>
	</div>
</form>
