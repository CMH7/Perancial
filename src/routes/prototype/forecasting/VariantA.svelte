<script lang="ts">
	// PROTOTYPE variant A, "Sheet": the Google Sheet made live. Two dense tables, edit in place.
	import {
		accName, addSource, allocateEarly, f, fmt, laterOutflows, paidOf, peso, recordAll, recordOne,
		rows, sections, sourceOk, status, total, undoAllocation, unfunded, useAsFunding
	} from './stub.svelte.ts';

	const r = $derived(rows());
	const funding = $derived(f.accounts.filter((a) => a.funding));
	let picking = $state(false);
	const sum = (k: 'inn' | 'fexp' | 'plannedLeft' | 'received' | 'paid' | 'left' | 'fealloc' | 'ealloc' | 'balanceToday') =>
		r.filter((x) => x.funding).reduce((s, x) => s + x[k], 0);
	const neg = (n: number) => (n < 0 ? 'text-red-600 font-medium' : '');
</script>

<h2 class="mb-1 font-semibold">Inflows</h2>
<div class="mb-8 overflow-x-auto rounded-xl border bg-white">
	<table class="w-full text-sm">
		<thead class="bg-emerald-800 text-left text-xs text-white">
			<tr>
				{#each ['Account / Inflow', 'Expected', 'Received on', 'In', 'Forecasted Exp', 'Planned left', 'Received', 'Paid', 'Left', 'Fcst E.Alloc', 'E.Alloc', 'Balance today'] as h (h)}
					<th class="px-2 py-1.5 font-medium">{h}</th>
				{/each}
			</tr>
		</thead>
		<tbody class="tabular-nums">
			{#each r as a (a.id)}
				<tr class="border-t {a.funding ? 'bg-gray-50 font-medium' : 'bg-gray-50 text-gray-400'}">
					<td class="px-2 py-1">
						{a.name}
						{#if !a.funding}
							<button class="ml-1 rounded border px-1 text-xs text-gray-600" onclick={() => useAsFunding(a.id)}>Use as Funding Account</button>
						{/if}
					</td>
					<td></td><td></td>
					<td class="px-2">{peso(a.inn)}</td>
					<td class="px-2">{a.funding ? peso(a.fexp) : ''}</td>
					<td class="px-2 {neg(a.plannedLeft)}">{a.funding ? peso(a.plannedLeft) : ''}</td>
					<td class="px-2">{peso(a.received)}</td>
					<td class="px-2">{a.funding ? peso(a.paid) : ''}</td>
					<td class="px-2 {neg(a.left)}">{a.funding ? peso(a.left) : ''}</td>
					<td class="px-2">{a.funding ? peso(a.fealloc) : ''}</td>
					<td class="px-2">{a.funding ? peso(a.ealloc) : ''}</td>
					<td class="px-2 text-gray-500">{peso(a.balanceToday)}</td>
				</tr>
				{#each a.inflows as i (i.id)}
					<tr class="border-t text-gray-700">
						<td class="py-1 pr-2 pl-6">
							├ {i.label}
							{#if i.late}<span class="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">Late</span>{/if}
						</td>
						<td class="px-2">{fmt(i.expected)}</td>
						<td class="px-2">{i.receivedOn ? fmt(i.receivedOn) : '—'}</td>
						<td class="px-2">
							{peso(i.amount + i.additional)}
							{#if i.additional}<span class="text-xs text-gray-400">(+{peso(i.additional)})</span>{/if}
						</td>
						<td colspan="2"></td>
						<td class="px-2">
							<label class="text-xs"><input type="checkbox" checked={i.received > 0} onchange={() => (i.received = i.received ? 0 : i.amount + i.additional)} /> received</label>
						</td>
						<td colspan="5"></td>
					</tr>
				{/each}
				{#if a.transferIn}
					<tr class="border-t text-gray-500"><td class="py-1 pr-2 pl-6">├ Transfer in</td><td colspan="2"></td><td class="px-2">{peso(a.transferIn)}</td><td colspan="8"></td></tr>
				{/if}
				{#if a.allocatedFor}
					<tr class="border-t text-gray-500"><td class="py-1 pr-2 pl-6">├ Early-allocated for this Cut-off</td><td colspan="2"></td><td class="px-2">{peso(a.allocatedFor)}</td><td colspan="8"></td></tr>
				{/if}
			{/each}
			<tr class="border-t-2 bg-emerald-50 font-semibold">
				<td class="px-2 py-1.5">Totals (Funding Accounts)</td><td colspan="2"></td>
				<td class="px-2">{peso(sum('inn'))}</td><td class="px-2">{peso(sum('fexp'))}</td>
				<td class="px-2 {neg(sum('plannedLeft'))}">{peso(sum('plannedLeft'))}</td>
				<td class="px-2">{peso(sum('received'))}</td><td class="px-2">{peso(sum('paid'))}</td>
				<td class="px-2">{peso(sum('left'))}</td><td class="px-2">{peso(sum('fealloc'))}</td>
				<td class="px-2">{peso(sum('ealloc'))}</td><td class="px-2 text-gray-500">{peso(sum('balanceToday'))}</td>
			</tr>
		</tbody>
	</table>
</div>

<div class="mb-1 flex items-center justify-between">
	<h2 class="font-semibold">Outflows</h2>
	<div class="flex gap-2 text-sm">
		<button class="rounded border bg-white px-2 py-1" onclick={() => (picking = !picking)}>Allocate early…</button>
		<button class="rounded border bg-white px-2 py-1">+ One-off Outflow</button>
		<button class="rounded border bg-white px-2 py-1">+ One-off Inflow</button>
	</div>
</div>
{#if picking}
	<div class="mb-2 rounded-lg border bg-white p-3 text-sm">
		<div class="mb-1 text-gray-500">Next Cut-off's Outflows (30 Nov) · fund now from Everyday into Bank B › Reserve</div>
		{#each laterOutflows as n (n.id)}
			<button class="mr-2 mb-1 rounded border px-2 py-0.5" onclick={() => allocateEarly(n.id, 'everyday')}>{n.label} · due {fmt(n.due)} · {peso(n.total)}</button>
		{:else}<span class="text-gray-400">Nothing left to allocate.</span>{/each}
	</div>
{/if}
<div class="overflow-x-auto rounded-xl border bg-white">
	<table class="w-full text-sm">
		<thead class="bg-emerald-800 text-left text-xs text-white">
			<tr>
				{#each ['Description', 'Due', 'Amount', 'Additional', 'Less', 'Total', 'E.Alloc', 'Paying sources (Account · amount · Paid)', ''] as h (h)}
					<th class="px-2 py-1.5 font-medium">{h}</th>
				{/each}
			</tr>
		</thead>
		<tbody class="tabular-nums">
			{#each sections() as s (s.name)}
				<tr class="border-t {s.name === 'Overdue' ? 'bg-amber-100' : s.items[0].kind === 'liability' ? 'bg-slate-200' : 'bg-rose-100'}">
					<td colspan="9" class="px-2 py-1 font-medium">{s.name}</td>
				</tr>
				{#each s.items as o (o.id)}
					<tr class="border-t align-top {status(o) === 'Paid' ? 'text-gray-400' : ''}">
						<td class="px-2 py-1">
							├ {o.label}
							{#if o.carried}<div class="text-xs text-amber-700">Carried over from 30 Oct</div>{/if}
							{#if o.allocatedIn}<div class="text-xs text-violet-700">Allocated in {o.allocatedIn}</div>{/if}
							{#if o.ealloc}<div class="text-xs text-violet-700">for {o.ealloc.forLabel}, due {fmt(o.ealloc.forDue)}</div>{/if}
						</td>
						<td class="px-2">{fmt(o.due)}</td>
						<td class="px-2"><input class="w-24 rounded border px-1" type="number" bind:value={o.amount} /></td>
						<td class="px-2">{o.additional ? peso(o.additional) : ''}</td>
						<td class="px-2">{o.less ? peso(o.less) : ''}</td>
						<td class="px-2 font-medium">{peso(total(o))}</td>
						<td class="px-2 text-center"><input type="checkbox" checked={!!o.ealloc} disabled /></td>
						<td class="px-2 py-1">
							{#each o.sources as src, k (k)}
								<div class="mb-0.5 flex items-center gap-1">
									<select class="rounded border px-1 {sourceOk(src) ? '' : 'border-amber-400 bg-amber-50'}" bind:value={src.account}>
										{#each f.accounts as a (a.id)}<option value={a.id} disabled={!a.funding}>{a.name}</option>{/each}
									</select>
									<input class="w-24 rounded border px-1" type="number" bind:value={src.amount} />
									<label class="text-xs"><input type="checkbox" checked={src.paid >= src.amount} onchange={() => recordOne(src)} /> Paid</label>
									{#if !sourceOk(src)}<span class="text-xs text-amber-700">not a Funding Account</span>{/if}
								</div>
							{/each}
							{#if unfunded(o) > 0}
								<div class="text-xs text-amber-700">
									Unfunded {peso(unfunded(o))}{o.usualAccount ? ` · usually ${o.usualAccount}` : ''}
									<select class="ml-1 rounded border text-xs" onchange={(e) => addSource(o, e.currentTarget.value)}>
										<option>+ source</option>
										{#each funding as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
									</select>
								</div>
							{/if}
						</td>
						<td class="px-2 text-xs whitespace-nowrap">
							<button class="underline" onclick={() => recordAll(o)}>Record all</button>
							{#if o.ealloc && paidOf(o) === 0}· <button class="underline" onclick={() => undoAllocation(o)}>Undo</button>{/if}
							· <a class="underline" href={o.plan}>Plan</a>
						</td>
					</tr>
					{#each o.breakdown ?? [] as c (c.label)}
						<tr class="border-t text-xs text-gray-500">
							<td class="py-0.5 pr-2 pl-8">└ {c.label}</td><td></td>
							<td class="px-2">{peso(c.amount)}</td><td class="px-2">{c.additional ? peso(c.additional) : ''}</td>
							<td></td><td class="px-2">{peso(c.amount + c.additional)}</td><td></td>
							<td class="px-2">{c.status}</td><td></td>
						</tr>
					{/each}
				{/each}
			{/each}
		</tbody>
	</table>
</div>
<p class="mt-2 text-xs text-gray-500">Editing: in place (amounts, sources). "Plan" opens the Scheduled / Installments page for anything else.</p>
