<script lang="ts" module>
	export const name = 'Journal grid';
</script>

<script lang="ts">
	// PROTOTYPE, throwaway. One grid of Entries with Out / In columns; fees are just more rows.
	import { formatAmount, today } from '#lib/domain/index.ts';
	import AccountSelect from './AccountSelect.svelte';
	import StatePanel from './StatePanel.svelte';
	import { centsToText, evaluate, KIND_STYLE, type Leaf, type Line, type PastTx } from './proto.ts';

	let { leaves, recent }: { leaves: Leaf[]; recent: PastTx[] } = $props();

	type Row = { accountId: string; out: string; in: string };
	const row = (): Row => ({ accountId: '', out: '', in: '' });
	let date = $state(today());
	let description = $state('');
	let note = $state('');
	let rows = $state<Row[]>([row(), row()]);
	let copyFrom = $state('');

	// A row with an Account and no amount is the one that takes the remainder, on whichever side balances.
	const split = $derived.by(() => {
		const from: Line[] = [];
		const to: Line[] = [];
		const where: { side: 'from' | 'to'; index: number }[] = [];
		const open = rows.filter((r) => r.accountId && !r.out.trim() && !r.in.trim());
		const outSum = rows.reduce((s, r) => s + (Number(r.out.replace(/,/g, '')) || 0), 0);
		const inSum = rows.reduce((s, r) => s + (Number(r.in.replace(/,/g, '')) || 0), 0);
		for (const r of rows) {
			if (!r.accountId && !r.out.trim() && !r.in.trim()) {
				where.push({ side: 'to', index: -1 });
				continue;
			}
			const isOpen = open.length === 1 && open[0] === r;
			const side = r.out.trim() || (isOpen && inSum > outSum) ? 'from' : 'to';
			const list = side === 'from' ? from : to;
			where.push({ side, index: list.length });
			list.push({ accountId: r.accountId, amount: side === 'from' ? r.out : r.in });
		}
		return { from, to, where };
	});
	const ev = $derived(evaluate(split.from, split.to, leaves));
	const filledHere = (i: number) => {
		const w = split.where[i];
		return w && ev.filled && ev.filled.side === w.side && ev.filled.index === w.index ? w : null;
	};

	function copy() {
		const tx = recent[Number(copyFrom)];
		if (!tx) return;
		date = today();
		description = tx.description;
		rows = [
			...tx.from.map((l) => ({ accountId: l.accountId, out: centsToText(l.cents), in: '' })),
			...tx.to.map((l) => ({ accountId: l.accountId, out: '', in: centsToText(l.cents) }))
		];
		copyFrom = '';
	}
</script>

<form class="mx-auto max-w-3xl p-6" onsubmit={(e) => (e.preventDefault(), alert('Prototype: nothing saved'))}>
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-semibold">
			New Transaction
			{#if ev.kind}<span class="ml-2 align-middle text-sm font-normal text-gray-500">· {ev.kind}</span>{/if}
		</h1>
		<select bind:value={copyFrom} onchange={copy} class="rounded border-gray-300 py-1 text-sm">
			<option value="">Copy from a past Transaction…</option>
			{#each recent as tx, i (i)}<option value={String(i)}>{tx.date} · {tx.description}</option>{/each}
		</select>
	</div>

	<div class="mt-4 flex gap-3">
		<input type="date" bind:value={date} class="w-40 rounded border-gray-300 text-sm" />
		<input bind:value={description} placeholder="Description (required)" class="flex-1 rounded border-gray-300 text-sm" />
	</div>

	<table class="mt-6 w-full text-sm">
		<thead class="text-left text-xs text-gray-500 uppercase">
			<tr><th class="pb-2">Account</th><th class="w-36 pb-2 text-right">Out of</th><th class="w-36 pb-2 text-right">Into</th><th class="w-6"></th></tr>
		</thead>
		<tbody>
			{#each rows as r, i (i)}
				{@const f = filledHere(i)}
				{@const fv = f ? (f.side === 'from' ? ev.from : ev.to)[f.index] : null}
				<tr class="border-t">
					<td class="py-1 pr-2"><AccountSelect bind:value={r.accountId} {leaves} class="w-full" /></td>
					<td class="py-1 pl-2">
						<input
							bind:value={r.out}
							oninput={() => (r.in = '')}
							inputmode="decimal"
							placeholder={f?.side === 'from' ? centsToText(fv ?? 0) : ''}
							class="w-full rounded border-gray-300 text-right text-sm tabular-nums placeholder:text-amber-700 {f?.side === 'from' ? 'bg-amber-50' : ''}"
						/>
					</td>
					<td class="py-1 pl-2">
						<input
							bind:value={r.in}
							oninput={() => (r.out = '')}
							inputmode="decimal"
							placeholder={f?.side === 'to' ? centsToText(fv ?? 0) : ''}
							class="w-full rounded border-gray-300 text-right text-sm tabular-nums placeholder:text-amber-700 {f?.side === 'to' ? 'bg-amber-50' : ''}"
						/>
					</td>
					<td class="pl-2">
						{#if rows.length > 2}<button type="button" class="text-gray-400 hover:text-rose-600" onclick={() => rows.splice(i, 1)}>✕</button>{/if}
					</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr class="border-t-2 font-medium tabular-nums">
				<td class="py-2"><button type="button" class="text-sky-700 hover:underline" onclick={() => rows.push(row())}>+ row</button></td>
				<td class="py-2 text-right">{formatAmount(ev.fromTotal)}</td>
				<td class="py-2 text-right">{formatAmount(ev.toTotal)}</td>
				<td></td>
			</tr>
			{#if ev.fromTotal !== ev.toTotal}
				<tr><td colspan="3" class="text-right text-xs text-rose-700">Out of and Into differ by {formatAmount(Math.abs(ev.fromTotal - ev.toTotal))}</td></tr>
			{/if}
		</tfoot>
	</table>

	<p class="mt-2 text-xs text-gray-500">
		A row with an Account and no amount takes the remainder. Fees and deductions are ordinary rows (e.g. Into Bank fees).
	</p>
	{#if ev.kind}
		<p class="mt-3 inline-block rounded px-2 py-1 text-xs {KIND_STYLE[ev.kind]}">This is {ev.kind === 'Income and Expense' ? 'both Income and an Expense' : `a${ev.kind === 'Income' || ev.kind === 'Expense' ? 'n' : ''} ${ev.kind}`}.</p>
	{/if}
	<textarea bind:value={note} placeholder="Note (optional)" rows="2" class="mt-3 w-full rounded border-gray-300 text-sm"></textarea>
	<div class="mt-3 flex justify-end">
		<button disabled={ev.errors.length > 0 || !description} class="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40">Save</button>
	</div>
	<StatePanel {ev} {leaves} {date} {description} />
</form>
