<script lang="ts" module>
	export const name = 'Split columns';
</script>

<script lang="ts">
	// PROTOTYPE, throwaway. From | To columns, a separate Fees section, Recent list with Duplicate.
	import { formatAmount, today } from '#lib/domain/index.ts';
	import AccountSelect from './AccountSelect.svelte';
	import StatePanel from './StatePanel.svelte';
	import { blank, centsToText, evaluate, KIND_STYLE, type Leaf, type Line, type PastTx } from './proto.ts';

	let { leaves, recent }: { leaves: Leaf[]; recent: PastTx[] } = $props();

	type Fee = Line & { mode: 'additional' | 'less' };
	let date = $state(today());
	let description = $state('');
	let note = $state('');
	let from = $state<Line[]>([blank()]);
	let to = $state<Line[]>([blank()]);
	let fees = $state<Fee[]>([]);

	// Fees are just more To lines on an Expense Account; the mode only explains the arithmetic.
	const ev = $derived(evaluate(from, [...to, ...fees], leaves));
	const isFilled = (side: 'from' | 'to', i: number) => ev.filled?.side === side && ev.filled.index === i;

	function duplicate(tx: PastTx) {
		date = today();
		description = tx.description;
		from = tx.from.map((l) => ({ accountId: l.accountId, amount: centsToText(l.cents) }));
		const isFee = (id: string) => leaves.find((l) => l.id === id)?.type === 'expense' && tx.to.length > 1;
		to = tx.to.filter((l) => !isFee(l.accountId)).map((l) => ({ accountId: l.accountId, amount: centsToText(l.cents) }));
		fees = tx.to
			.filter((l) => isFee(l.accountId))
			.map((l) => ({ accountId: l.accountId, amount: centsToText(l.cents), mode: 'additional' }));
		if (to.length === 0) to = [blank()];
	}
</script>

<div class="mx-auto flex max-w-6xl gap-8 p-6">
	<form class="flex-1" onsubmit={(e) => (e.preventDefault(), alert('Prototype: nothing saved'))}>
		<div class="flex items-center gap-3">
			<h1 class="text-xl font-semibold">New Transaction</h1>
			{#if ev.kind}<span class="rounded-full px-2 py-0.5 text-xs font-medium {KIND_STYLE[ev.kind]}">{ev.kind}</span>{/if}
		</div>

		<div class="mt-4 grid grid-cols-[10rem_1fr] gap-3">
			<input type="date" bind:value={date} class="rounded border-gray-300 text-sm" />
			<input bind:value={description} placeholder="Description (required)" class="rounded border-gray-300 text-sm" />
		</div>

		<div class="mt-6 grid grid-cols-2 gap-6">
			{@render column('from', 'From', from, ev.fromTotal)}
			{@render column('to', 'To', to, ev.to.slice(0, to.length).reduce<number>((s, x) => s + (x ?? 0), 0))}
		</div>

		{#snippet column(side: 'from' | 'to', label: string, lines: Line[], total: number)}
				<section>
					<h2 class="mb-2 text-sm font-semibold text-gray-500 uppercase">{label}</h2>
					{#each lines as line, i (i)}
						<div class="mb-2 flex gap-2">
							<AccountSelect bind:value={line.accountId} {leaves} class="min-w-0 flex-1" />
							<input
								bind:value={line.amount}
								inputmode="decimal"
								placeholder={isFilled(side, i) ? centsToText((side === 'from' ? ev.from : ev.to)[i] ?? 0) : '0.00'}
								class="w-32 rounded border-gray-300 text-right text-sm tabular-nums {isFilled(side, i)
									? 'bg-amber-50 placeholder:text-amber-700'
									: ''}"
							/>
							{#if lines.length > 1}
								<button type="button" class="text-gray-400 hover:text-rose-600" onclick={() => lines.splice(i, 1)}>✕</button>
							{/if}
						</div>
					{/each}
					<button type="button" class="text-sm text-sky-700 hover:underline" onclick={() => lines.push(blank())}>
						+ another {side === 'from' ? 'source' : 'destination'}
					</button>
					<p class="mt-2 text-right text-sm text-gray-500 tabular-nums">Total {formatAmount(total)}</p>
				</section>
		{/snippet}

		<section class="mt-4 rounded-lg bg-gray-50 p-3">
			<h2 class="mb-2 text-sm font-semibold text-gray-500 uppercase">Fees</h2>
			{#each fees as fee, k (k)}
				<div class="mb-2 flex items-center gap-2">
					<select bind:value={fee.mode} class="rounded border-gray-300 py-1 text-sm">
						<option value="additional">Additional (on top of From)</option>
						<option value="less">Less (taken out of To)</option>
					</select>
					<AccountSelect bind:value={fee.accountId} {leaves} only={['expense']} class="min-w-0 flex-1" />
					<input bind:value={fee.amount} inputmode="decimal" placeholder="0.00" class="w-28 rounded border-gray-300 text-right text-sm" />
					<button type="button" class="text-gray-400 hover:text-rose-600" onclick={() => fees.splice(k, 1)}>✕</button>
				</div>
			{/each}
			<button
				type="button"
				class="text-sm text-sky-700 hover:underline"
				onclick={() => fees.push({ accountId: leaves.find((l) => l.id === 'bank-fees')?.id ?? '', amount: '', mode: 'additional' })}
				>+ fee</button
			>
		</section>

		<p class="mt-3 text-xs text-gray-500">
			Leave one amount blank and it fills with the remainder (amber). Totals must match to save.
		</p>
		<textarea bind:value={note} placeholder="Note (optional)" rows="2" class="mt-3 w-full rounded border-gray-300 text-sm"></textarea>
		<div class="mt-3 flex justify-end">
			<button disabled={ev.errors.length > 0 || !description} class="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40">Save</button>
		</div>
		<StatePanel {ev} {leaves} {date} {description} />
	</form>

	<aside class="w-72 shrink-0">
		<h2 class="mb-2 text-sm font-semibold text-gray-500 uppercase">Recent</h2>
		<ul class="divide-y rounded-lg border bg-white text-sm">
			{#each recent as tx, i (i)}
				<li class="flex items-center justify-between gap-2 p-3">
					<div class="min-w-0">
						<p class="truncate">{tx.description}</p>
						<p class="text-xs text-gray-500">{tx.date} · {formatAmount(tx.from.reduce((s, l) => s + l.cents, 0))}</p>
					</div>
					<button class="rounded border px-2 py-1 text-xs hover:bg-gray-100" onclick={() => duplicate(tx)}>Duplicate</button>
				</li>
			{/each}
		</ul>
	</aside>
</div>
