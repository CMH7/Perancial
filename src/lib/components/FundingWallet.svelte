<script lang="ts">
	// The Funding Accounts picker, drawn as the inside of a wallet: every Asset Leaf is a card
	// tucked in a pocket with its name, Group and Balance today showing; click one and it slides
	// out (a Funding Account this Cut-off). "+ New" swaps the wallet for the new-card form.
	import CreateAccountForm from './CreateAccountForm.svelte';
	import WalletCard from './WalletCard.svelte';
	import WalletSearch from './WalletSearch.svelte';
	import { formatAmount, pickAccounts, type PickerItem } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let {
		items,
		picked = $bindable(),
		title,
		error,
		onsave,
		oncancel
	}: {
		/** The cards: Accounts that can be Funding Accounts, in chart order. */
		items: PickerItem[];
		picked: string[];
		title: string;
		error: string;
		onsave: () => void;
		oncancel: () => void;
	} = $props();

	const total = $derived(
		items.filter((i) => picked.includes(i.id)).reduce((s, i) => s + i.balance, 0)
	);
	let adding = $state(false);
	let query = $state('');
	let group = $state('');
	const groups = $derived(
		[...new Set(items.map((i) => i.path))].map((p) => ({ key: `g:${p}`, label: p || 'Assets' }))
	);
	const shown = $derived.by(() => {
		const hit = new Set(pickAccounts(items, { query }).map((i) => i.id));
		return items.filter((i) => hit.has(i.id) && (!group || `g:${i.path}` === group));
	});
	// A new card goes in the Group being filtered on, else at the top level.
	const newParent = $derived.by(() => {
		const leaf = group ? items.find((i) => `g:${i.path}` === group) : undefined;
		return (leaf && ledger.chart.account(leaf.id)?.parentId) || 'asset';
	});
	const toggle = (id: string) =>
		(picked = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
</script>

{#if adding}
	<div class="flex h-full flex-col">
		<div class="flex items-center gap-2 border-b p-4">
			<button
				class="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100"
				aria-label="Back to the wallet"
				onclick={() => (adding = false)}>←</button
			>
			<h2 class="text-lg font-semibold">New card</h2>
		</div>
		<div class="flex-1 overflow-y-auto p-4">
			<CreateAccountForm
				parentId={newParent}
				name={query.trim()}
				types={['asset']}
				preview
				title={null}
				onclose={() => (adding = false)}
				oncreated={(_, leaves) => {
					picked = [...picked, ...leaves.filter((id) => !picked.includes(id))];
					adding = false;
					// Show the new cards: they may sit in a new Group the filter hides.
					query = '';
					group = '';
				}}
			/>
		</div>
	</div>
{:else}
	<div class="flex h-full flex-col">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{title}</h2>
			<p class="text-sm text-gray-500">
				{picked.length}
				{picked.length === 1 ? 'card' : 'cards'} out · {formatAmount(total)} today
			</p>
			<div class="mt-3">
				<WalletSearch
					bind:query
					bind:filter={group}
					filters={groups}
					shown={shown.length}
					total={items.length}
					autofocus
					onadd={() => (adding = true)}
				/>
			</div>
		</div>

		<div class="flex-1 overflow-y-auto p-4">
			<div class="grid grid-cols-2 gap-x-4 gap-y-2">
				{#each shown as item (item.id)}
					{@const on = picked.includes(item.id)}
					<button
						class="group relative h-36 overflow-hidden rounded-t-2xl text-left"
						aria-pressed={on}
						title={on ? `Tuck ${item.name} back in` : `Take out ${item.name}`}
						onclick={() => toggle(item.id)}
					>
						<div
							class="absolute inset-x-1 transition-transform duration-300 motion-reduce:transition-none {on
								? 'top-1.5'
								: 'top-1.5 translate-y-10 group-hover:translate-y-6 group-focus-visible:translate-y-6'}"
						>
							<WalletCard
								name={item.name}
								path={item.path}
								type={item.type}
								balance={item.balance}
								compact
								peek
								selected={on}
							/>
						</div>
						<!-- The pocket. -->
						<div
							class="absolute inset-x-0 bottom-0 h-12 rounded-b-lg border-t border-gray-200 bg-white shadow-[0_-8px_14px_-8px_rgb(0_0_0/0.3)] transition-opacity {on
								? 'opacity-0'
								: ''}"
						></div>
					</button>
				{:else}
					<div class="col-span-2 py-10 text-center text-sm text-gray-500">
						{#if items.length}
							No card matches{query.trim() ? ` “${query.trim()}”` : ''}.
						{:else}
							No Asset Leaf Accounts yet.
						{/if}
						<button class="ml-1 underline" onclick={() => (adding = true)}
							>Make {query.trim() ? `“${query.trim()}”` : 'a new card'}</button
						>
					</div>
				{/each}
			</div>
		</div>

		<div class="flex items-center justify-end gap-2 border-t p-3 text-sm">
			{#if error}<span class="mr-auto text-red-600">{error}</span>{/if}
			<button class="rounded px-3 py-1 hover:bg-gray-100" onclick={oncancel}>Cancel</button>
			<button class="rounded bg-gray-900 px-3 py-1 text-white" onclick={onsave}>Save</button>
		</div>
	</div>
{/if}
