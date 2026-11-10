<script lang="ts">
	// PROTOTYPE: the sheet's row table (#, payment date, principal, interest, total, additionals,
	// paid, balance) with row actions. Editing a row turns a flat plan varied.
	import {
		isOverdue,
		peso,
		rowAdditionals,
		rowLeft,
		rowTotal,
		shortDate,
		STATE_LABEL,
		type Plan,
		type Row
	} from './proto.ts';

	let { plan = $bindable(), actions = true }: { plan: Plan; actions?: boolean } = $props();
	let editing = $state<number | null>(null);
	let draft = $state({ principal: '', interest: '' });

	function startEdit(r: Row) {
		editing = r.n;
		draft = { principal: (r.principal / 100).toFixed(2), interest: (r.interest / 100).toFixed(2) };
	}
	function saveEdit(r: Row) {
		r.principal = Math.round(+draft.principal * 100);
		r.interest = Math.round(+draft.interest * 100);
		plan.entry = 'varied';
		editing = null;
	}
	const act = (what: string, r: Row) =>
		alert(`PROTOTYPE: ${what} for ${plan.title} #${r.n} would open here.`);
	const badge = (r: Row) =>
		isOverdue(r)
			? 'bg-amber-100 text-amber-800'
			: r.state === 'paid'
				? 'bg-green-100 text-green-800'
				: r.state === 'partly'
					? 'bg-sky-100 text-sky-800'
					: r.state === 'before'
						? 'bg-gray-100 text-gray-500'
						: 'bg-white text-gray-600 border';
</script>

<table class="w-full text-sm">
	<thead class="text-left text-xs text-gray-500 uppercase">
		<tr class="border-b">
			<th class="py-2 pr-2">#</th>
			<th class="pr-2">Payment date</th>
			<th class="pr-2 text-right">Principal</th>
			<th class="pr-2 text-right">Interest</th>
			<th class="pr-2 text-right">Total</th>
			<th class="pr-2">Additionals</th>
			<th class="pr-2">Paid</th>
			<th class="pr-2 text-right">Left</th>
			{#if actions}<th></th>{/if}
		</tr>
	</thead>
	<tbody>
		{#each plan.rows as r (r.n)}
			<tr class="border-b last:border-0 {r.state === 'before' ? 'text-gray-400' : ''}">
				<td class="py-1.5 pr-2 font-mono">{r.n}</td>
				<td class="pr-2">{shortDate(r.date)}</td>
				{#if editing === r.n}
					<td class="pr-2 text-right"
						><input class="w-24 rounded border px-1 text-right" bind:value={draft.principal} /></td
					>
					<td class="pr-2 text-right"
						><input class="w-20 rounded border px-1 text-right" bind:value={draft.interest} /></td
					>
				{:else}
					<td class="pr-2 text-right tabular-nums">{peso(r.principal)}</td>
					<td class="pr-2 text-right tabular-nums">{r.interest ? peso(r.interest) : ''}</td>
				{/if}
				<td class="pr-2 text-right font-medium tabular-nums">{peso(r.principal + r.interest)}</td>
				<td class="pr-2 text-xs">
					{#each r.additionals as a (a.description)}<div>
							{a.description}
							{peso(a.amount)}
						</div>{/each}
				</td>
				<td class="pr-2">
					<span class="rounded px-1.5 py-0.5 text-xs {badge(r)}">
						{isOverdue(r) ? 'Overdue' : STATE_LABEL[r.state]}
					</span>
				</td>
				<td class="pr-2 text-right tabular-nums">
					{#if r.state === 'unpaid' || r.state === 'partly'}{peso(rowLeft(r))}{/if}
				</td>
				{#if actions}
					<td class="text-right whitespace-nowrap">
						{#if editing === r.n}
							<button class="text-xs text-blue-700" onclick={() => saveEdit(r)}>Save</button>
							<button class="ml-1 text-xs text-gray-500" onclick={() => (editing = null)}
								>Cancel</button
							>
						{:else if r.state !== 'before'}
							{#if r.state !== 'paid'}
								<button
									class="rounded bg-gray-900 px-2 py-0.5 text-xs text-white"
									onclick={() => act(`Record ${peso(rowLeft(r))}`, r)}>Record</button
								>
								<button class="ml-1 text-xs text-gray-600" onclick={() => act('Link existing', r)}
									>Link</button
								>
							{/if}
							{#if r.state === 'partly'}
								<button class="ml-1 text-xs text-gray-600" onclick={() => act('Mark paid', r)}
									>Mark paid</button
								>
							{/if}
							<button class="ml-1 text-xs text-gray-600" onclick={() => startEdit(r)}>Edit</button>
						{/if}
					</td>
				{/if}
			</tr>
			{#if r.payments.length && actions}
				<tr class="text-xs text-gray-500">
					<td></td>
					<td colspan="8" class="pb-1.5">
						{#each r.payments as p (p.date + p.description)}
							Paid by “{p.description}”, {shortDate(p.date)}, {peso(p.amount)}
							<button class="ml-1 underline" onclick={() => act('Unlink', r)}>Unlink</button>
						{/each}
						of {peso(rowTotal(r))}{rowAdditionals(r) ? ' incl. additionals' : ''}
					</td>
				</tr>
			{/if}
		{/each}
	</tbody>
</table>
