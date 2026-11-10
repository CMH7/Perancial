<script lang="ts">
	// An Installment Plan's row table: status, paying Transactions, and editing one row at a time.
	// Rules live in the domain module; this component shows them and collects input.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		formatAmount,
		installmentLinkCandidates,
		parseAmount,
		planAddRow,
		planEditRow,
		planLink,
		planMarkRowPaid,
		planRemoveRow,
		planUnlink,
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
	/** The row whose "Link existing" list is open. */
	let linking = $state<string | null>(null);
	const candidates = $derived(
		linking ? installmentLinkCandidates(ledger.chart, plan, linking) : []
	);
	const now = () => ({ now: new Date() });
	const allPlans = () => [...ledger.scheduled, ...ledger.installments];

	function record(due: string) {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- resolved path plus a query
		goto(`${resolve('/transactions/new')}?installment=${encodeURIComponent(plan.id)}&due=${due}`);
	}
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
					<td class="text-right whitespace-nowrap">
						{#if s.state === 'unpaid' || s.state === 'partly-paid'}
							<button
								class="rounded bg-gray-900 px-2 py-0.5 text-xs text-white"
								onclick={() => record(s.row.due)}>Record</button
							>
							<button
								class="ml-1 text-xs text-gray-600 hover:text-gray-900"
								onclick={() => (linking = linking === s.row.due ? null : s.row.due)}>Link</button
							>
						{/if}
						{#if s.state === 'partly-paid'}
							<button
								class="ml-1 text-xs text-gray-600 hover:text-gray-900"
								onclick={() =>
									run(() =>
										planMarkRowPaid(ledger.chart, ledger.installments, plan, s.row.due, true, now())
									)}>Mark paid</button
							>
						{:else if s.state === 'paid' && s.row.settled}
							<button
								class="ml-1 text-xs text-gray-600 hover:text-gray-900"
								onclick={() =>
									run(() =>
										planMarkRowPaid(
											ledger.chart,
											ledger.installments,
											plan,
											s.row.due,
											false,
											now()
										)
									)}>Mark unpaid</button
							>
						{/if}
						<button class="ml-1 text-xs text-gray-600 hover:text-gray-900" onclick={() => start(s)}
							>Edit</button
						>
					</td>
				{/if}
			</tr>
			{#if linking === s.row.due}
				<tr class="bg-gray-50 text-xs">
					<td></td>
					<td colspan="8" class="py-2">
						{#if candidates.length === 0}
							<span class="text-gray-500"
								>No unlinked Transaction on this plan's Account within 31 days of the row.</span
							>
						{:else}
							<ul class="space-y-1">
								{#each candidates as tx (tx.id)}
									<li class="flex items-center gap-3">
										<span class="w-24 text-gray-500">{shortDate(tx.date!)}</span>
										<span class="flex-1">{tx.description}</span>
										<button
											class="text-blue-700"
											onclick={() =>
												run(() =>
													planLink(
														ledger.chart,
														tx.id,
														{ plan: 'installment', planId: plan.id, due: s.row.due },
														now()
													)
												).then(() => (linking = null))}>Link</button
										>
									</li>
								{/each}
							</ul>
						{/if}
					</td>
				</tr>
			{/if}
			{#if s.payments.length}
				<tr class="text-xs text-gray-500">
					<td></td>
					<td colspan="8" class="pb-1.5">
						{#each s.payments as tx (tx.id)}
							<span class="mr-3">
								<a class="hover:underline" href={resolve('/transactions/[id]', { id: tx.id })}
									>Paid by “{tx.description}”, {shortDate(tx.date!)}</a
								>
								<button
									class="ml-1 underline"
									onclick={() =>
										run(() => planUnlink(ledger.chart, tx.id, { ...now(), plans: allPlans() }))}
									>Unlink</button
								>
							</span>
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
