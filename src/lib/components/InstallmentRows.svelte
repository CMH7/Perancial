<script lang="ts">
	// An Installment Plan's row table: status, paying Transactions, and editing one row at a time.
	// Rules live in the domain module; this component shows them and collects input.
	import { resolve } from '$app/paths';
	import {
		formatAmount,
		parseAmount,
		planAddRow,
		planEditRow,
		planRemoveRow,
		rowAdditionals,
		shortDate,
		type Installment,
		type RowStatus
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let { plan, rows }: { plan: Installment; rows: RowStatus[] } = $props();

	type Edit = {
		due: string;
		date: string;
		principal: string;
		interest: string;
		additionals: { description: string; amount: string }[];
	};
	let edit = $state<Edit | null>(null);
	let error = $state('');
	const text = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;

	function start(s: RowStatus) {
		error = '';
		edit = {
			due: s.row.due,
			date: s.row.date,
			principal: text(s.row.principal),
			interest: text(s.row.interest),
			additionals: s.row.additionals.map((a) => ({
				description: a.description,
				amount: text(a.amount)
			}))
		};
	}

	async function run(writes: () => ReturnType<typeof planAddRow>) {
		error = '';
		try {
			await ledger.commit(writes());
			edit = null;
		} catch (err) {
			error = (err as Error).message;
		}
	}

	function save() {
		const e = edit!;
		const cents = (t: string) => (t.trim() === '' ? 0 : parseAmount(t));
		const principal = cents(e.principal);
		const interest = cents(e.interest);
		const additionals = e.additionals.map((a) => ({
			description: a.description.trim(),
			amount: parseAmount(a.amount) ?? -1
		}));
		if (principal === null || principal < 0 || interest === null || interest < 0)
			return (error = 'Enter amounts like 1,234.50');
		if (additionals.some((a) => !a.description || a.amount <= 0))
			return (error = 'Describe each additional and give it an amount');
		run(() =>
			planEditRow(
				ledger.chart,
				ledger.installments,
				plan,
				e.due,
				{ date: e.date, principal, interest, additionals },
				{ now: new Date() }
			)
		);
	}

	const badge = (s: RowStatus) =>
		s.overdue
			? ['Overdue', 'bg-amber-100 text-amber-800']
			: s.state === 'paid'
				? ['Paid', 'bg-green-100 text-green-800']
				: s.state === 'partly-paid'
					? ['Partly paid', 'bg-sky-100 text-sky-800']
					: s.state === 'before'
						? ['Before tracking', 'bg-gray-100 text-gray-500']
						: ['Unpaid', 'border text-gray-600'];
	const peso = (c: number) => formatAmount(c);
	const input = 'rounded border-gray-300 px-1 py-0 text-right text-sm';
</script>

{#if error}<p class="mb-2 rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>{/if}
<table class="w-full text-sm">
	<thead class="text-left text-xs text-gray-500 uppercase">
		<tr class="border-b">
			<th class="py-2 pr-2">#</th>
			<th class="pr-2">Payment date</th>
			<th class="pr-2 text-right">Principal</th>
			<th class="pr-2 text-right">Interest</th>
			<th class="pr-2 text-right">Total</th>
			<th class="pr-2">Additionals</th>
			<th class="pr-2">Status</th>
			<th class="pr-2 text-right">Left</th>
			<th></th>
		</tr>
	</thead>
	<tbody>
		{#each rows as s (s.row.due)}
			{@const [label, style] = badge(s)}
			<tr class="border-b align-top {s.state === 'before' ? 'text-gray-400' : ''}">
				<td class="py-1.5 pr-2 font-mono">{s.row.n}</td>
				{#if edit?.due === s.row.due}
					<td class="pr-2"
						><input type="date" class="{input} text-left" bind:value={edit.date} /></td
					>
					<td class="pr-2 text-right"
						><input class="{input} w-24" inputmode="decimal" bind:value={edit.principal} /></td
					>
					<td class="pr-2 text-right"
						><input class="{input} w-20" inputmode="decimal" bind:value={edit.interest} /></td
					>
					<td></td>
					<td class="pr-2">
						{#each edit.additionals as a, k (k)}
							<div class="mb-1 flex gap-1">
								<input
									class="{input} w-28 text-left"
									placeholder="Processing fee"
									bind:value={a.description}
								/>
								<input class="{input} w-20" inputmode="decimal" bind:value={a.amount} />
								<button
									type="button"
									class="text-gray-500"
									onclick={() => edit!.additionals.splice(k, 1)}>×</button
								>
							</div>
						{/each}
						<button
							type="button"
							class="text-xs text-blue-700"
							onclick={() => edit!.additionals.push({ description: '', amount: '' })}
							>+ additional</button
						>
					</td>
					<td colspan="2"></td>
					<td class="text-right whitespace-nowrap">
						<button class="text-xs font-medium text-blue-700" onclick={save}>Save</button>
						<button class="ml-1 text-xs text-gray-500" onclick={() => (edit = null)}>Cancel</button>
					</td>
				{:else}
					<td class="pr-2">
						{shortDate(s.row.date)}
						{#if s.row.date !== s.row.due}<span class="block text-xs text-gray-400"
								>was {shortDate(s.row.due)}</span
							>{/if}
					</td>
					<td class="pr-2 text-right tabular-nums">{peso(s.row.principal)}</td>
					<td class="pr-2 text-right tabular-nums">{s.row.interest ? peso(s.row.interest) : ''}</td>
					<td class="pr-2 text-right font-medium tabular-nums"
						>{peso(s.row.principal + s.row.interest)}</td
					>
					<td class="pr-2 text-xs">
						{#each s.row.additionals as a, k (k)}<div>{a.description} {peso(a.amount)}</div>{/each}
					</td>
					<td class="pr-2"><span class="rounded px-1.5 py-0.5 text-xs {style}">{label}</span></td>
					<td class="pr-2 text-right tabular-nums">
						{#if s.state === 'unpaid' || s.state === 'partly-paid'}{peso(s.remaining)}{/if}
					</td>
					<td class="text-right">
						<button class="text-xs text-gray-600 hover:text-gray-900" onclick={() => start(s)}
							>Edit</button
						>
					</td>
				{/if}
			</tr>
			{#if s.payments.length}
				<tr class="text-xs text-gray-500">
					<td></td>
					<td colspan="8" class="pb-1.5">
						{#each s.payments as tx (tx.id)}
							<a class="mr-3 hover:underline" href={resolve('/transactions/[id]', { id: tx.id })}
								>Paid by “{tx.description}”, {shortDate(tx.date!)}</a
							>
						{/each}
						({peso(s.paid)} of {peso(s.total)}{rowAdditionals(s.row)
							? ', additionals included'
							: ''})
					</td>
				</tr>
			{/if}
		{/each}
	</tbody>
</table>
<div class="mt-3 flex gap-3 text-sm">
	<button
		class="text-blue-700"
		onclick={() =>
			run(() => planAddRow(ledger.chart, ledger.installments, plan, { now: new Date() }))}
		>+ Add a row at the end</button
	>
	{#if plan.rows.length > 1}
		<button
			class="text-gray-600"
			onclick={() =>
				run(() => planRemoveRow(ledger.chart, ledger.installments, plan, { now: new Date() }))}
			>Remove the last row</button
		>
	{/if}
</div>
