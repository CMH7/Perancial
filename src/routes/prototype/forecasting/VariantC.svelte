<script lang="ts">
	// PROTOTYPE variant C, "Checklist": phone-first. Funding Accounts as a sticky strip of tiles,
	// then Outflows as a due-date checklist per Section; tap a row to expand and record. No editing
	// here: "Open plan" goes to the Scheduled / Installments page.
	import {
		accName, allocateEarly, f, fmt, laterOutflows, paidOf, peso, recordAll, recordOne, rows,
		sections, sourceOk, status, total, undoAllocation, unfunded, useAsFunding
	} from './stub.svelte.ts';

	const r = $derived(rows());
	let expanded = $state<string | null>(null);
	let showIn = $state(false);
	const pill = (s: string) =>
		s === 'Paid' ? 'bg-emerald-100 text-emerald-800' : s === 'Partly Paid' ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-700';
</script>

<div class="mx-auto max-w-xl">
	<div class="sticky top-0 z-10 -mx-4 mb-4 flex gap-2 overflow-x-auto bg-gray-50/95 px-4 py-2 backdrop-blur">
		{#each r.filter((a) => a.funding) as a (a.id)}
			<div class="min-w-36 rounded-lg border bg-white px-3 py-2">
				<div class="truncate text-xs text-gray-500">{a.name}</div>
				<div class="font-semibold tabular-nums {a.plannedLeft < 0 ? 'text-red-600' : ''}">{peso(a.plannedLeft)}</div>
				<div class="text-[11px] text-gray-400">planned left · today {peso(a.balanceToday)}</div>
			</div>
		{/each}
	</div>

	{#each sections() as s (s.name)}
		<h3 class="mt-4 mb-1 text-xs font-semibold tracking-wide uppercase {s.name === 'Overdue' ? 'text-amber-700' : 'text-gray-500'}">{s.name}</h3>
		<ul class="divide-y rounded-xl border bg-white">
			{#each [...s.items].sort((a, b) => a.due.localeCompare(b.due)) as o (o.id)}
				<li>
					<button class="flex w-full items-center gap-3 px-3 py-2.5 text-left" onclick={() => (expanded = expanded === o.id ? null : o.id)}>
						<span class="text-lg {status(o) === 'Paid' ? 'text-emerald-600' : 'text-gray-300'}">{status(o) === 'Paid' ? '●' : '○'}</span>
						<span class="min-w-0 flex-1">
							<span class="block truncate {status(o) === 'Paid' ? 'text-gray-400 line-through' : ''}">{o.label}</span>
							<span class="block text-xs text-gray-500">
								{fmt(o.due)} · {o.sources.map((x) => accName(x.account)).join(' + ') || 'no source'}
								{#if o.ealloc}<span class="text-violet-700"> · E.Alloc</span>{/if}
								{#if o.allocatedIn}<span class="text-violet-700"> · allocated in {o.allocatedIn}</span>{/if}
							</span>
						</span>
						<span class="text-right">
							<span class="block tabular-nums">{peso(total(o))}</span>
							{#if unfunded(o) > 0 || o.sources.some((x) => !sourceOk(x))}<span class="block text-xs text-amber-700">Unfunded</span>{:else}<span class="rounded px-1.5 text-xs {pill(status(o))}">{status(o)}</span>{/if}
						</span>
					</button>
					{#if expanded === o.id}
						<div class="border-t bg-gray-50 px-3 py-2 text-sm">
							{#if o.breakdown}
								{#each o.breakdown as c (c.label)}<div class="flex justify-between text-xs text-gray-500"><span>└ {c.label}</span><span>{peso(c.amount + c.additional)}</span></div>{/each}
							{/if}
							{#each o.sources as src, k (k)}
								<div class="mt-1 flex items-center justify-between">
									<span>{accName(src.account)} · {peso(src.amount)}{#if !sourceOk(src)}<span class="text-xs text-amber-700"> (not funding)</span>{/if}</span>
									{#if src.paid >= src.amount}<span class="text-emerald-700">Paid</span>{:else}<button class="rounded border bg-white px-2 py-0.5" onclick={() => recordOne(src)}>Record</button>{/if}
								</div>
							{/each}
							{#if unfunded(o) > 0}<div class="mt-1 text-xs text-amber-700">Unfunded {peso(unfunded(o))}{o.usualAccount ? ` · usually ${o.usualAccount}` : ''}</div>{/if}
							<div class="mt-2 flex gap-2">
								<button class="rounded bg-gray-900 px-3 py-1 text-white" onclick={() => recordAll(o)}>Record all</button>
								{#if o.ealloc && paidOf(o) === 0}<button class="rounded border bg-white px-3 py-1" onclick={() => undoAllocation(o)}>Undo allocation</button>{/if}
								<a class="rounded border bg-white px-3 py-1" href={o.plan}>Open plan ↗</a>
							</div>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}

	<details class="mt-4 rounded-xl border bg-white px-3 py-2 text-sm">
		<summary class="cursor-pointer font-medium">Allocate early from the 30 Nov Cut-off</summary>
		{#each laterOutflows as n (n.id)}
			<div class="mt-1 flex justify-between"><span>{n.label} · {fmt(n.due)}</span><button class="underline" onclick={() => allocateEarly(n.id, 'everyday')}>Reserve {peso(n.total)}</button></div>
		{:else}<div class="text-gray-400">Nothing left.</div>{/each}
	</details>

	<button class="mt-4 w-full rounded-xl border bg-white px-3 py-2 text-left text-sm font-medium" onclick={() => (showIn = !showIn)}>
		Money coming in {showIn ? '▾' : '▸'}
	</button>
	{#if showIn}
		<ul class="mt-1 divide-y rounded-xl border bg-white text-sm">
			{#each r as a (a.id)}
				<li class="px-3 py-2 {a.funding ? '' : 'text-gray-400'}">
					<div class="flex justify-between font-medium"><span>{a.name}</span><span class="tabular-nums">{peso(a.inn)}</span></div>
					{#each a.inflows as i (i.id)}<div class="flex justify-between text-xs text-gray-500"><span>{i.label}{i.late ? ' · Late' : ''}</span><span>{i.received ? 'received ' + fmt(i.receivedOn ?? i.expected) : 'expected ' + fmt(i.expected)}</span></div>{/each}
					{#if a.transferIn}<div class="text-xs text-gray-500">Transfer in {peso(a.transferIn)}</div>{/if}
					{#if !a.funding}<button class="mt-1 rounded border px-2 text-xs text-gray-600" onclick={() => useAsFunding(a.id)}>Use as Funding Account</button>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
