<script lang="ts">
	// Chart of Accounts: a collapsible tree pane (Account Type tabs over the tree) beside the open
	// Account's detail and register, filling the window under the nav bar.
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		ACCOUNT_TYPE_GUIDE,
		archiveCheck,
		clearedBalance,
		deleteCheck,
		forecastAccountUsers,
		planDeleteAccount,
		planSetArchived
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { goto } from '$app/navigation';
	import AccountRegister from '#lib/components/AccountRegister.svelte';
	import AccountTree from '#lib/components/AccountTree.svelte';
	import Amount from '#lib/components/Amount.svelte';
	import ConfirmAction from '#lib/components/ConfirmAction.svelte';
	import CreateAccountForm from '#lib/components/CreateAccountForm.svelte';
	import EditAccountForm from '#lib/components/EditAccountForm.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import MoveAccountForm from '#lib/components/MoveAccountForm.svelte';

	let showArchived = $state(false);
	/** The open dialog, if any. */
	let dialog = $state<'create' | 'edit' | 'move' | 'archive' | 'delete' | null>(null);
	const close = () => (dialog = null);

	const chart = $derived(ledger.chart);
	const id = $derived(page.params.id ?? 'asset');
	const path = $derived(chart.path(id));
	const account = $derived(path.at(-1));
	const guide = $derived(ACCOUNT_TYPE_GUIDE.find((g) => g.type === account?.type));
	const children = $derived(chart.children(id, { showArchived }));
	const group = $derived(chart.isGroup(id));
	const accountHref = (accountId: string) => resolve('/accounts/[id]', { id: accountId });
	const insideLabel = (n: number) => `${n} ${n === 1 ? 'account' : 'accounts'} inside`;
	const andInside = (n: number) => (n ? ` and ${insideLabel(n)}` : '');

	// The tree pane can be hidden to give the detail the width (`[` toggles it). Remembered on
	// this browser; private windows may refuse storage, and then it just isn't remembered.
	const COLLAPSED_KEY = 'perancial.accounts.treeCollapsed';
	let collapsed = $state(readCollapsed());
	function readCollapsed() {
		try {
			return localStorage.getItem(COLLAPSED_KEY) === '1';
		} catch {
			return false;
		}
	}
	$effect(() => {
		try {
			localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
		} catch {
			// Not remembered.
		}
	});
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== '[' || e.ctrlKey || e.metaKey || e.altKey || dialog) return;
		const t = e.target;
		if (t instanceof Element && t.closest('input, textarea, select, [contenteditable]')) return;
		collapsed = !collapsed;
	}
</script>

<svelte:window {onkeydown} />

{#if ledger.error}
	<main class="mx-auto max-w-3xl px-4 py-8">
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	</main>
{:else if !ledger.ready}
	<main class="mx-auto max-w-3xl px-4 py-8">
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	</main>
{:else if !account}
	<main class="mx-auto max-w-3xl px-4 py-8">
		<div class="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
			This account doesn't exist (it may have been deleted).
			<a href={accountHref('asset')} class="text-blue-600 hover:underline">Back to Assets</a>
		</div>
	</main>
{:else}
	<div
		class="grid h-[calc(100vh-var(--nav-h))] overflow-hidden transition-[grid-template-columns] duration-200"
		style="grid-template-columns: {collapsed ? '3rem' : '24rem'} minmax(0, 1fr)"
	>
		<AccountTree {path} bind:showArchived bind:collapsed />

		<main class="min-h-0 overflow-y-auto bg-gray-50 px-10 py-8">
			<nav class="mb-2 flex flex-wrap items-center gap-1 text-xs text-gray-500" aria-label="Path">
				{#each path as p, i (p.id)}
					{#if i > 0}<span aria-hidden="true">›</span>{/if}
					{#if p.id === account.id}
						<span class="text-gray-900">{p.name}</span>
					{:else}
						<a href={accountHref(p.id)} class="hover:underline">{p.name}</a>
					{/if}
				{/each}
			</nav>

			<div class="flex flex-wrap items-start justify-between gap-6">
				<div class="min-w-0">
					<h1 class="text-3xl font-semibold tracking-tight break-words">{account.name}</h1>
					<p class="mt-1 text-sm text-gray-500">
						{account.description || (group ? 'Group Account' : 'Leaf Account')}
						{#if account.archived}<span class="ml-1 rounded bg-gray-200 px-1 text-xs">archived</span
							>{/if}
					</p>
					{#if account.system === 'root' && guide}
						<p class="mt-0.5 text-xs text-gray-400">e.g. {guide.examples}</p>
					{/if}
				</div>
				<dl class="flex gap-8 text-right">
					<div>
						<dt class="text-xs text-gray-500">Balance</dt>
						<dd class="text-2xl"><Amount value={chart.balance(account.id)} bold /></dd>
					</div>
					{#if account.type === 'asset' || account.type === 'liability'}
						<div title="Counting only cleared Transactions">
							<dt class="text-xs text-gray-500">Cleared</dt>
							<dd class="text-2xl text-gray-500">
								<Amount value={clearedBalance(chart, account.id)} />
							</dd>
						</div>
					{/if}
					{#if group}
						<div>
							<dt class="text-xs text-gray-500">Inside</dt>
							<dd class="text-2xl">{chart.descendantCount(account.id)}</dd>
						</div>
					{/if}
				</dl>
			</div>

			<div class="mt-5 flex flex-wrap gap-1 border-b pb-4 text-sm">
				{#if account.system !== 'opening-balances'}
					<button
						onclick={() => (dialog = 'create')}
						class="mr-2 rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700"
						>+ Add account inside</button
					>
					<button onclick={() => (dialog = 'edit')} class="rounded-md px-3 py-1.5 hover:bg-gray-200"
						>Edit</button
					>
				{/if}
				{#if !account.system}
					<button onclick={() => (dialog = 'move')} class="rounded-md px-3 py-1.5 hover:bg-gray-200"
						>Move</button
					>
					<button
						onclick={() => (dialog = 'archive')}
						class="rounded-md px-3 py-1.5 hover:bg-gray-200"
						>{account.archived ? 'Unarchive' : 'Archive'}</button
					>
					<button
						onclick={() => (dialog = 'delete')}
						class="rounded-md px-3 py-1.5 text-red-600 hover:bg-red-50">Delete</button
					>
				{/if}
			</div>

			{#if children.length}
				<div class="mt-4 flex flex-wrap gap-2" aria-label="Accounts inside">
					{#each children as c (c.id)}
						<a
							href={accountHref(c.id)}
							class="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm ring-1 ring-gray-200 hover:ring-gray-400 {c.archived
								? 'opacity-50'
								: ''}"
							>{c.name}<span class="text-xs text-gray-500"
								><Amount value={chart.balance(c.id)} /></span
							></a
						>
					{/each}
				</div>
			{/if}

			<AccountRegister accountId={account.id} onopening={() => (dialog = 'edit')} />
		</main>
	</div>
{/if}

{#if dialog && account}
	<Modal onclose={close}>
		{#if dialog === 'create'}
			<CreateAccountForm
				parentId={account.id}
				onclose={close}
				oncreated={(groupId) => {
					close();
					if (groupId) goto(accountHref(groupId));
				}}
			/>
		{:else if dialog === 'edit'}
			<EditAccountForm accountId={account.id} onclose={close} />
		{:else if dialog === 'move'}
			<MoveAccountForm accountId={account.id} onclose={close} />
		{:else if dialog === 'archive' && account.archived}
			<ConfirmAction
				title="Unarchive {account.name}"
				check={{ allowed: true, inside: chart.descendantCount(account.id) }}
				question="Show {account.name}{andInside(chart.descendantCount(account.id))} again?"
				confirmLabel="Unarchive"
				onclose={close}
				onconfirm={async () => {
					await ledger.commit(planSetArchived(chart, account.id, false, { now: new Date() }));
					close();
				}}
			/>
		{:else if dialog === 'archive'}
			{@const check = archiveCheck(chart, account.id)}
			<ConfirmAction
				title="Archive {account.name}"
				{check}
				question="Archive {account.name}{andInside(
					check.allowed ? check.inside : 0
				)}? It will be hidden but keeps its history, and you can unarchive it later."
				confirmLabel="Archive"
				onclose={close}
				onconfirm={async () => {
					await ledger.commit(planSetArchived(chart, account.id, true, { now: new Date() }));
					close();
				}}
			/>
		{:else if dialog === 'delete'}
			{@const users = [...ledger.installments, ...forecastAccountUsers(ledger)]}
			{@const check = deleteCheck(chart, account.id, users)}
			<ConfirmAction
				title="Delete {account.name}"
				{check}
				question="Delete {account.name}{andInside(
					check.allowed ? check.inside : 0
				)}? This can't be undone."
				confirmLabel="Delete"
				danger
				onclose={close}
				onconfirm={async () => {
					const parentId = account.parentId ?? 'asset';
					await ledger.commit(planDeleteAccount(chart, account.id, users));
					close();
					goto(accountHref(parentId));
				}}
			/>
		{/if}
	</Modal>
{/if}
