<script lang="ts">
	// Chart of Accounts, drill-down layout: one level at a time, Account Types as tabs.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ACCOUNT_TYPE_GUIDE } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { goto } from '$app/navigation';
	import Amount from '#lib/components/Amount.svelte';
	import CreateAccountForm from '#lib/components/CreateAccountForm.svelte';
	import EditAccountForm from '#lib/components/EditAccountForm.svelte';
	import Modal from '#lib/components/Modal.svelte';

	let showArchived = $state(false);
	let creating = $state(false);
	let editing = $state(false);

	const chart = $derived(ledger.chart);
	const id = $derived(page.params.id ?? 'asset');
	const path = $derived(chart.path(id));
	const account = $derived(path.at(-1));
	const guide = $derived(ACCOUNT_TYPE_GUIDE.find((g) => g.type === account?.type));
	const root = $derived(path[0]);
	const children = $derived(chart.children(id, { showArchived }));
	const totals = $derived(chart.totals());
	const group = $derived(chart.isGroup(id));
	const accountHref = (accountId: string) => resolve('/accounts/[id]', { id: accountId });
	const insideLabel = (n: number) => `${n} ${n === 1 ? 'account' : 'accounts'} inside`;
</script>

<main class="mx-auto max-w-3xl px-4 py-8">
	{#if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else}
		<div class="mb-6 flex flex-wrap items-baseline justify-between gap-2">
			<h1 class="text-2xl font-semibold">Accounts</h1>
			<div class="text-right text-sm text-gray-500">
				Net Worth <span class="ml-1 text-xl text-gray-900"
					><Amount value={totals.netWorth} bold /></span
				>
				<div class="text-xs">
					Assets <Amount value={totals.assets} /> · Liabilities <Amount
						value={totals.liabilities}
					/>
				</div>
			</div>
		</div>

		<nav
			class="mb-4 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-gray-200)]"
			aria-label="Account Types"
		>
			{#each ACCOUNT_TYPE_GUIDE as g (g.type)}
				<a
					href={accountHref(g.type)}
					title={g.what}
					aria-current={root?.id === g.type ? 'page' : undefined}
					class="border-b-2 px-4 py-2 text-sm whitespace-nowrap {root?.id === g.type
						? 'border-gray-900 font-semibold'
						: 'border-transparent text-gray-500 hover:text-gray-800'}"
					>{g.label}<span class="ml-2 text-xs text-gray-400"
						><Amount value={chart.balance(g.type)} /></span
					></a
				>
			{/each}
		</nav>

		{#if !account}
			<div class="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
				This account doesn't exist (it may have been deleted).
				<a href={accountHref('asset')} class="text-blue-600 hover:underline">Back to Assets</a>
			</div>
		{:else}
			{#if root && guide}
				<div
					class="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"
				>
					<span class="font-semibold">{guide.label}:</span>
					{root.description}
					<div class="mt-0.5 text-xs text-blue-700">e.g. {guide.examples}</div>
				</div>
			{/if}

			<nav class="mb-4 flex flex-wrap items-center gap-1 text-sm text-gray-500" aria-label="Path">
				{#each path as p, i (p.id)}
					{#if i > 0}<span aria-hidden="true">›</span>{/if}
					{#if p.id === account.id}
						<span class="font-semibold text-gray-900">{p.name}</span>
					{:else}
						<a href={accountHref(p.id)} class="hover:underline">{p.name}</a>
					{/if}
				{/each}
			</nav>

			<div class="mb-4 flex items-end justify-between gap-4 rounded-xl bg-gray-900 p-5 text-white">
				<div>
					<div class="text-sm text-gray-400">
						{#if account.system === 'root'}
							Total {account.name}
						{:else}
							{account.description || (group ? 'Group Account' : 'Leaf Account')}
						{/if}
						{#if account.archived}<span class="ml-2 rounded bg-gray-700 px-1.5 text-xs"
								>archived</span
							>{/if}
					</div>
					<div class="text-3xl"><Amount value={chart.balance(account.id)} bold /></div>
				</div>
				{#if account.system !== 'opening-balances'}
					<button
						onclick={() => (editing = true)}
						class="rounded px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 hover:text-white"
						>Edit</button
					>
				{/if}
			</div>

			<ul class="divide-y rounded-xl border bg-white">
				{#each children as child (child.id)}
					{@const childGroup = chart.isGroup(child.id)}
					<li>
						<a
							href={accountHref(child.id)}
							class="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 {child.archived
								? 'opacity-50'
								: ''}"
						>
							<div class="min-w-0">
								<div class="font-medium">
									{child.name}
									{#if child.archived}<span class="ml-2 rounded bg-gray-200 px-1 text-[10px]"
											>archived</span
										>{/if}
								</div>
								<div class="truncate text-xs text-gray-500">
									{child.description}{#if childGroup}{child.description ? ' · ' : ''}{insideLabel(
											chart.descendantCount(child.id)
										)}{/if}
								</div>
							</div>
							<div class="flex items-center gap-3">
								<Amount value={chart.balance(child.id)} bold={childGroup} />
								<span class="text-gray-300" aria-hidden="true">›</span>
							</div>
						</a>
					</li>
				{:else}
					<li class="px-5 py-8 text-center text-sm text-gray-500">
						{#if group}
							No accounts here yet.
						{:else}
							Transactions for this account will list here.
						{/if}
					</li>
				{/each}
			</ul>

			<div class="mt-3 flex items-center justify-between text-sm">
				{#if account.system !== 'opening-balances'}
					<button onclick={() => (creating = true)} class="text-blue-600 hover:underline"
						>+ Add account inside {account.name}</button
					>
				{:else}
					<span></span>
				{/if}
				<label class="flex items-center gap-2 text-gray-600">
					<input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived
				</label>
			</div>
		{/if}
	{/if}
</main>

{#if creating && account}
	<Modal onclose={() => (creating = false)}>
		<CreateAccountForm
			parentId={account.id}
			onclose={() => (creating = false)}
			oncreated={(groupId) => {
				creating = false;
				if (groupId) goto(accountHref(groupId));
			}}
		/>
	</Modal>
{/if}

{#if editing && account}
	<Modal onclose={() => (editing = false)}>
		<EditAccountForm accountId={account.id} onclose={() => (editing = false)} />
	</Modal>
{/if}
