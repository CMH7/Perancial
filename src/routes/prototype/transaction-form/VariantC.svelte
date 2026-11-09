<script lang="ts" module>
	export const name = 'Sentence quick-add';
</script>

<script lang="ts">
	// PROTOTYPE, throwaway. Amount-first sentence ("₱150 from BPI to Groceries"); splits and fees
	// unfold only when asked for. Typing a Description suggests past Transactions to duplicate.
	import { formatAmount, today } from '#lib/domain/index.ts';
	import AccountSelect from './AccountSelect.svelte';
	import StatePanel from './StatePanel.svelte';
	import { blank, centsToText, evaluate, KIND_STYLE, type Leaf, type Line, type PastTx } from './proto.ts';

	let { leaves, recent }: { leaves: Leaf[]; recent: PastTx[] } = $props();

	let date = $state(today());
	let description = $state('');
	let note = $state('');
	let from = $state<Line[]>([blank()]);
	let to = $state<Line[]>([blank()]);
	let fees = $state<Line[]>([]);
	let showSuggest = $state(false);

	const ev = $derived(evaluate(from, [...to, ...fees], leaves));
	const suggestions = $derived(
		description.trim().length < 2
			? []
			: recent.filter((t) => t.description.toLowerCase().includes(description.trim().toLowerCase()))
	);
	const nameOf = (id: string) => leaves.find((l) => l.id === id)?.name ?? '?';
	const shown = (side: 'from' | 'to', i: number) =>
		ev.filled?.side === side && ev.filled.index === i ? formatAmount((side === 'from' ? ev.from : ev.to)[i] ?? 0) : '';

	function use(tx: PastTx) {
		const fee = (id: string) => leaves.find((l) => l.id === id)?.type === 'expense' && tx.to.length > 1;
		description = tx.description;
		date = today();
		// Amounts copied too; the source is left blank so it re-balances if the amount is changed.
		from = tx.from.map((l, i) => ({ accountId: l.accountId, amount: tx.from.length === 1 && i === 0 ? '' : centsToText(l.cents) }));
		to = tx.to.filter((l) => !fee(l.accountId)).map((l) => ({ accountId: l.accountId, amount: centsToText(l.cents) }));
		fees = tx.to.filter((l) => fee(l.accountId)).map((l) => ({ accountId: l.accountId, amount: centsToText(l.cents) }));
		showSuggest = false;
	}
</script>

<form class="mx-auto max-w-2xl p-6" onsubmit={(e) => (e.preventDefault(), alert('Prototype: nothing saved'))}>
	<div class="relative">
		<input
			bind:value={description}
			onfocus={() => (showSuggest = true)}
			placeholder="What was it? (Description)"
			class="w-full border-0 border-b-2 border-gray-200 px-0 text-2xl focus:border-gray-900 focus:ring-0"
		/>
		{#if showSuggest && suggestions.length}
			<ul class="absolute z-10 mt-1 w-full rounded-lg border bg-white text-sm shadow-lg">
				{#each suggestions as tx, i (i)}
					<li>
						<button type="button" class="flex w-full justify-between px-3 py-2 text-left hover:bg-gray-50" onclick={() => use(tx)}>
							<span>{tx.description} <span class="text-gray-400">· last {tx.date}</span></span>
							<span class="text-gray-500 tabular-nums">{formatAmount(tx.from.reduce((s, l) => s + l.cents, 0))} · fill</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="mt-6 space-y-3 text-lg leading-loose">
		{#each to as line, i (i)}
			<p class="flex flex-wrap items-center gap-2">
				<span class="text-gray-400">{i === 0 ? '' : 'and'}</span>
				<span class="text-gray-400">₱</span>
				<input bind:value={line.amount} inputmode="decimal" placeholder={shown('to', i) || '0.00'} class="w-36 rounded border-gray-300 text-right text-lg tabular-nums {shown('to', i) ? 'bg-amber-50 placeholder:text-amber-700' : ''}" />
				<span class="text-gray-400">for / into</span>
				<AccountSelect bind:value={line.accountId} {leaves} />
				{#if i > 0}<button type="button" class="text-sm text-gray-400" onclick={() => to.splice(i, 1)}>✕</button>{/if}
			</p>
		{/each}
		{#each fees as fee, k (k)}
			<p class="flex flex-wrap items-center gap-2 text-base">
				<span class="text-gray-400">plus a ₱</span>
				<input bind:value={fee.amount} inputmode="decimal" class="w-24 rounded border-gray-300 text-right text-base" />
				<span class="text-gray-400">fee to</span>
				<AccountSelect bind:value={fee.accountId} {leaves} only={['expense']} />
				<button type="button" class="text-sm text-gray-400" onclick={() => fees.splice(k, 1)}>✕</button>
			</p>
		{/each}
		{#each from as line, i (i)}
			<p class="flex flex-wrap items-center gap-2">
				<span class="text-gray-400">{i === 0 ? 'paid from' : 'and from'}</span>
				<AccountSelect bind:value={line.accountId} {leaves} />
				<span class="text-gray-400">₱</span>
				<input bind:value={line.amount} inputmode="decimal" placeholder={shown('from', i) || 'auto'} class="w-36 rounded border-gray-300 text-right text-lg tabular-nums {shown('from', i) ? 'bg-amber-50 placeholder:text-amber-700' : ''}" />
				{#if i > 0}<button type="button" class="text-sm text-gray-400" onclick={() => from.splice(i, 1)}>✕</button>{/if}
			</p>
		{/each}
		<p class="text-gray-400">on <input type="date" bind:value={date} class="rounded border-gray-300 text-base" /></p>
	</div>

	<div class="mt-4 flex flex-wrap gap-2 text-sm">
		<button type="button" class="rounded-full border px-3 py-1 hover:bg-gray-50" onclick={() => from.push(blank())}>+ another source</button>
		<button type="button" class="rounded-full border px-3 py-1 hover:bg-gray-50" onclick={() => to.push(blank())}>+ another destination</button>
		<button type="button" class="rounded-full border px-3 py-1 hover:bg-gray-50" onclick={() => fees.push({ accountId: leaves.find((l) => l.id === 'bank-fees')?.id ?? '', amount: '' })}>+ fee</button>
	</div>

	{#if ev.kind}
		<p class="mt-6 rounded-lg px-4 py-3 {KIND_STYLE[ev.kind]}">
			<strong>{ev.kind}</strong>:
			{from.map((l) => nameOf(l.accountId)).join(' + ')} → {[...to, ...fees].map((l) => nameOf(l.accountId)).join(' + ')},
			{formatAmount(ev.fromTotal)}
		</p>
	{/if}
	<textarea bind:value={note} placeholder="Note (optional)" rows="2" class="mt-4 w-full rounded border-gray-300 text-sm"></textarea>
	<div class="mt-3 flex justify-end">
		<button disabled={ev.errors.length > 0 || !description} class="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40">Save</button>
	</div>
	<StatePanel {ev} {leaves} {date} {description} />
</form>
