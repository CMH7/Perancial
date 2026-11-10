<script lang="ts">
	// PROTOTYPE variant B, "Account lanes": one lane per Funding Account (like envelopes). Each lane
	// shows money in and every source drawing on it, so a negative lane says where to move a source.
	// Click any item to open it in a drawer (edit there; "Open plan" for the rest).
	import {
		accName, addSource, billNext, movedCharges, allocateEarly, f, fmt, laterOutflows, paidOf, peso, recordAll, recordOne,
		rows, sourceOk, status, total, undoAllocation, unfunded, useAsFunding, type Outflow
	} from './stub.svelte.ts';

	const r = $derived(rows());
	let openId = $state<string | null>(null);
	const open = $derived(f.outflows.find((o) => o.id === openId));
	let picking = $state(false);
	const unfundedItems = $derived(f.outflows.filter((o) => unfunded(o) > 0 || o.sources.some((s) => !sourceOk(s))));
	const draws = (acc: string) =>
		f.outflows.flatMap((o) => o.sources.filter((s) => s.account === acc).map((s) => ({ o, s })));
	const tag = (o: Outflow) => (o.section === 'Overdue' ? 'Overdue' : o.section);

	// Tracking one Outflow across lanes: hover or open it and every card of it lights up.
	let hoverId = $state<string | null>(null);
	const focusId = $derived(hoverId ?? openId);
	const PALETTE = ['border-l-sky-500', 'border-l-fuchsia-500', 'border-l-orange-500', 'border-l-teal-500', 'border-l-indigo-500'];
	const splitColor = (o: Outflow) =>
		o.sources.length > 1
			? 'border-l-4 ' + PALETTE[f.outflows.filter((x) => x.sources.length > 1).indexOf(o) % PALETTE.length]
			: '';

	// Drag a card to another lane to move that source there; drag from Unfunded to add a source.
	let drag = $state<{ oid: string; k: number } | null>(null);
	let overLane = $state<string | null>(null);
	function drop(lane: string) {
		overLane = null;
		const o = f.outflows.find((x) => x.id === drag?.oid);
		if (!o || !drag) return;
		if (drag.k < 0) addSource(o, lane);
		else {
			const s = o.sources[drag.k];
			if (s.paid > 0 || s.account === lane) return;
			const same = o.sources.find((x) => x.account === lane);
			if (same) {
				same.amount += s.amount;
				o.sources.splice(drag.k, 1);
			} else s.account = lane;
		}
		drag = null;
	}

	// Click selects, double-click opens, Ctrl+C then click a lane copies the Outflow there as a new source.
	let selectedId = $state<string | null>(null);
	let copiedId = $state<string | null>(null);
	let paste = $state<{ oid: string; lane: string; amount: number } | null>(null);
	function onkeydown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest('input, textarea, select')) return;
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedId) copiedId = selectedId;
		if (e.key === 'Escape') ((copiedId = null), (selectedId = null), (menu = null));
	}
	function laneClick(lane: string, funding: boolean) {
		if (!copiedId || !funding) return;
		const o = f.outflows.find((x) => x.id === copiedId);
		if (o) paste = { oid: o.id, lane, amount: unfunded(o) };
	}
	function confirmPaste() {
		const o = f.outflows.find((x) => x.id === paste?.oid);
		if (o && paste && paste.amount > 0) {
			const same = o.sources.find((x) => x.account === paste!.lane);
			if (same) same.amount += paste.amount;
			else o.sources.push({ account: paste.lane, amount: paste.amount, paid: 0 });
		}
		paste = null;
		copiedId = null;
	}

	// Right-click or long-press a card: context menu. "Show in all Funding Accounts" filters every
	// lane to that Outflow's cards; nothing is removed.
	let menu = $state<{ oid: string; x: number; y: number } | null>(null);
	let onlyId = $state<string | null>(null);
	let pressTimer: ReturnType<typeof setTimeout> | undefined;
	const openMenu = (oid: string, x: number, y: number) => (menu = { oid, x, y });
	function pressStart(e: PointerEvent, oid: string) {
		const { clientX: x, clientY: y } = e;
		pressTimer = setTimeout(() => openMenu(oid, x, y), 550);
	}
	const pressEnd = () => clearTimeout(pressTimer);

	// "+ Outflow" / "+ Inflow": one-off (a `once` Scheduled Transaction) or repeating (the Scheduled form).
	let adding = $state<'outflow' | 'inflow' | null>(null);
	let mode = $state<'once' | 'repeat'>('once');
	const blank = () => ({ label: '', date: '2026-11-20', amount: 0, account: 'everyday', section: 'Others' });
	let draft = $state(blank());
	function saveDraft() {
		if (!draft.label || !draft.amount) return;
		const id = 'new-' + Date.now();
		if (adding === 'outflow')
			f.outflows.push({ id, section: draft.section, label: draft.label, due: draft.date, amount: draft.amount, additional: 0, less: 0, plan: '/scheduled', sources: [{ account: draft.account, amount: draft.amount, paid: 0 }] });
		else
			f.inflows.push({ id, label: draft.label, account: draft.account, expected: draft.date, amount: draft.amount, additional: 0, received: 0 });
		adding = null;
		draft = blank();
	}
</script>

<svelte:window {onkeydown} onclick={() => (menu = null)} />

{#if copiedId || onlyId}
	<div class="mb-2 flex items-center gap-3 rounded-lg bg-sky-50 px-3 py-1.5 text-sm text-sky-900">
		{#if copiedId}<span>Copied <b>{f.outflows.find((o) => o.id === copiedId)?.label}</b>: click a Funding Account lane to add it there as a source. Esc cancels.</span>{/if}
		{#if onlyId}<span>Showing only <b>{f.outflows.find((o) => o.id === onlyId)?.label}</b> in every lane.</span><button class="underline" onclick={() => (onlyId = null)}>Show all</button>{/if}
	</div>
{/if}

<div class="mb-3 flex gap-2 text-sm">
	<button class="rounded border bg-white px-2 py-1" onclick={() => (picking = !picking)}>Allocate early…</button>
	<button class="rounded border bg-white px-2 py-1" onclick={() => ((adding = 'outflow'), (openId = null))}>+ Outflow</button>
	<button class="rounded border bg-white px-2 py-1" onclick={() => ((adding = 'inflow'), (openId = null))}>+ Inflow</button>
	<span class="self-center text-xs text-gray-400">Click selects · double-click opens · Ctrl+C then click a lane copies · right-click or hold for more · drag moves a source</span>
</div>
{#if picking}
	<div class="mb-3 rounded-lg border bg-white p-3 text-sm">
		{#each laterOutflows as n (n.id)}
			<button class="mr-2 mb-1 rounded border px-2 py-0.5" onclick={() => allocateEarly(n.id, 'everyday')}>{n.label} · {fmt(n.due)} · {peso(n.total)}</button>
		{:else}<span class="text-gray-400">Nothing left to allocate.</span>{/each}
	</div>
{/if}

<div class="flex gap-3 overflow-x-auto pb-2">
	{#if unfundedItems.length}
		<section class="w-64 shrink-0 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3">
			<h3 class="font-semibold text-amber-900">Unfunded</h3>
			<p class="mb-2 text-xs text-amber-800">Give these a source</p>
			{#each unfundedItems.filter((o) => !onlyId || o.id === onlyId) as o (o.id)}
				<button class="mb-1 block w-full cursor-grab rounded border bg-white px-2 py-1 text-left text-sm shadow-sm {focusId === o.id || selectedId === o.id ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-300' : ''}" onclick={(e) => { e.stopPropagation(); selectedId = o.id; }} ondblclick={() => (openId = o.id)} oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(o.id, e.clientX, e.clientY); }} onpointerdown={(e) => pressStart(e, o.id)} onpointerup={pressEnd} onpointerleave={pressEnd} draggable="true" ondragstart={() => (drag = { oid: o.id, k: -1 })} onmouseenter={() => (hoverId = o.id)} onmouseleave={() => (hoverId = null)}>
					{o.label}<span class="float-right tabular-nums">{peso(unfunded(o) + o.sources.filter((s) => !sourceOk(s)).reduce((t, s) => t + s.amount, 0))}</span>
					{#if o.usualAccount}<div class="text-xs text-gray-500">usually {o.usualAccount}</div>{/if}
				</button>
			{/each}
		</section>
	{/if}

	{#each r as a (a.id)}
		<section class="w-72 shrink-0 rounded-xl border bg-white p-3 {a.funding ? '' : 'opacity-60'} {overLane === a.id ? 'ring-2 ring-sky-400' : ''} {copiedId && a.funding ? 'cursor-copy outline-2 outline-dashed outline-sky-300' : ''}" role="list" ondragover={(e) => { if (a.funding && drag) { e.preventDefault(); overLane = a.id; } }} ondragleave={() => (overLane = null)} ondrop={() => drop(a.id)} onclick={() => laneClick(a.id, a.funding)}>
			<h3 class="font-semibold">{a.name}</h3>
			<div class="text-xs text-gray-500">Balance today {peso(a.balanceToday)}</div>
			{#if !a.funding}
				<button class="mt-2 rounded border px-2 py-0.5 text-xs" onclick={() => useAsFunding(a.id)}>Use as Funding Account</button>
			{/if}
			<div class="my-3 rounded-lg p-2 text-center {a.plannedLeft < 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}">
				<div class="text-xs">Planned left</div>
				<div class="text-xl font-semibold tabular-nums">{peso(a.plannedLeft)}</div>
				<div class="text-xs">in {peso(a.inn)} − out {peso(a.fexp)} · left now {peso(a.left)}</div>
			</div>
			<div class="text-xs font-medium text-gray-500 uppercase">In</div>
			{#each a.inflows as i (i.id)}
				<div class="flex justify-between text-sm">
					<span>{i.label}{#if i.late}<span class="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">Late</span>{/if}</span>
					<span class="tabular-nums {i.received ? 'text-emerald-700' : ''}">{peso(i.amount + i.additional)}</span>
				</div>
			{/each}
			{#if a.transferIn}<div class="flex justify-between text-sm text-gray-500"><span>Transfer in</span><span class="tabular-nums">{peso(a.transferIn)}</span></div>{/if}
			{#if a.allocatedFor}<div class="flex justify-between text-sm text-violet-700"><span>Allocated earlier</span><span class="tabular-nums">{peso(a.allocatedFor)}</span></div>{/if}
			{#if a.funding}
				<div class="mt-2 text-xs font-medium text-gray-500 uppercase">Out</div>
				{#each draws(a.id).filter((d) => !onlyId || d.o.id === onlyId) as { o, s }, k (o.id + k)}
					<button class="mt-1 block w-full rounded border px-2 py-1 text-left text-sm {splitColor(o)} {focusId === o.id || selectedId === o.id ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-300' : 'hover:bg-gray-50'} {s.paid >= s.amount ? 'text-gray-400' : 'cursor-grab'}" onclick={(e) => { e.stopPropagation(); selectedId = o.id; }} ondblclick={() => (openId = o.id)} oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); openMenu(o.id, e.clientX, e.clientY); }} onpointerdown={(e) => pressStart(e, o.id)} onpointerup={pressEnd} onpointerleave={pressEnd} draggable={s.paid === 0} ondragstart={() => (drag = { oid: o.id, k: o.sources.indexOf(s) })} onmouseenter={() => (hoverId = o.id)} onmouseleave={() => (hoverId = null)}>
						<span class="mr-1 text-xs text-gray-400">{s.paid >= s.amount ? '✓' : '○'}</span>{o.label}
						<span class="float-right tabular-nums">{peso(s.amount)}</span>
						<div class="text-xs text-gray-500">{tag(o)} · due {fmt(o.due)}{o.sources.length > 1 ? ` · ${o.sources.indexOf(s) + 1} of ${o.sources.length} sources, total ${peso(total(o))}` : ''}{o.ealloc ? ' · E.Alloc' : ''}{o.allocatedIn ? ` · allocated in ${o.allocatedIn}` : ''}</div>
						{#if o.breakdown}<div class="text-xs text-gray-500">{o.breakdown.length} charges{o.breakdown.some((c) => c.recorded) ? ` · incl. ${o.breakdown.filter((c) => c.recorded).map((c) => c.label).join(', ')}` : ''}</div>{/if}
					</button>
				{/each}
				{#each f.unplanned.filter((u) => u.account === a.id && !onlyId) as u (u.id)}
					<div class="mt-2 text-xs font-medium text-gray-500 uppercase">Unplanned</div>
					<div class="mt-1 rounded border border-dashed px-2 py-1 text-sm text-gray-600">
						{u.label}<span class="float-right tabular-nums">{peso(u.amount)}</span>
						<div class="text-xs text-gray-500">recorded {fmt(u.date)} · lowers Left, not Planned left</div>
					</div>
				{/each}
			{/if}
		</section>
	{/each}
</div>

{#if open}
	<div class="fixed inset-0 z-40 bg-black/20" role="presentation" onclick={() => (openId = null)}></div>
	<aside class="fixed top-0 right-0 z-40 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
		<button class="float-right text-gray-500" onclick={() => (openId = null)}>✕</button>
		<div class="text-xs text-gray-500">{open.section}</div>
		<h3 class="text-lg font-semibold">{open.label}</h3>
		<p class="text-sm text-gray-500">Due {fmt(open.due)} · {status(open)} · total {peso(total(open))}{open.additional ? ` (incl. ${peso(open.additional)} additional)` : ''}</p>
		{#if open.ealloc}<p class="mt-1 text-sm text-violet-700">E.Alloc: reserves for {open.ealloc.forLabel}, due {fmt(open.ealloc.forDue)} ({open.ealloc.cutoff} Cut-off)</p>{/if}
		{#if open.breakdown}
			<h4 class="mt-4 text-sm font-medium">Charges on this card</h4>
			{#each movedCharges.filter((m) => m.card === open.section) as m (m.label)}<p class="text-xs text-violet-700">{m.label} moved to the {m.to} payment</p>{/each}
			{#each open.breakdown as c (c.label)}
				<div class="flex items-center justify-between gap-2 border-b py-1 text-sm">
					<span>{c.label}
						{#if c.recorded}<span class="ml-1 rounded bg-sky-100 px-1 text-xs text-sky-800">recorded {fmt(c.recorded)}</span>{:else}<span class="ml-1 text-xs text-gray-400">{c.status}</span>{/if}
					</span>
					<span class="flex items-center gap-2"><span class="tabular-nums">{peso(c.amount + c.additional)}</span>
						<button class="text-xs text-gray-500 underline" onclick={() => billNext(open!, c)}>Bill with next payment</button></span>
				</div>
			{/each}
			<p class="mt-1 text-xs text-gray-500">Charges recorded on this card join its next payment by themselves.</p>
		{/if}
		<h4 class="mt-4 text-sm font-medium">Paying sources</h4>
		{#each open.sources as s, k (k)}
			<div class="mt-1 flex items-center gap-2 text-sm">
				<select class="max-w-56 rounded border px-1 text-xs" bind:value={s.account}>
					{#each f.accounts as a (a.id)}<option value={a.id} disabled={!a.funding}>{a.name} — left {peso(r.find((x) => x.id === a.id)?.plannedLeft ?? 0)}</option>{/each}
				</select>
				<input class="w-24 rounded border px-1 text-xs" type="number" bind:value={s.amount} />
				{#if s.amount > 0 && s.paid >= s.amount}<span class="text-emerald-700">Paid</span>{:else}<button class="underline" onclick={() => recordOne(s)}>Record</button>
					<button class="text-gray-400" title="Remove source" onclick={() => open!.sources.splice(k, 1)}>✕</button>{/if}
			</div>
			{#if !sourceOk(s)}<div class="text-xs text-amber-700">{accName(s.account)} isn't a Funding Account this Cut-off{s.suggested ? ' (suggested by a charge)' : ''}</div>{/if}
		{/each}
		<div class="mt-2 flex items-center gap-2 text-sm">
			<select class="rounded border px-1 text-xs" onchange={(e) => { addSource(open!, e.currentTarget.value); e.currentTarget.selectedIndex = 0; }}>
				<option>+ Add paying source…</option>
				{#each f.accounts.filter((a) => a.funding) as a (a.id)}<option value={a.id}>{a.name} — left {peso(r.find((x) => x.id === a.id)?.plannedLeft ?? 0)}</option>{/each}
			</select>
			<span class="text-xs text-gray-500">sources {peso(open.sources.reduce((t, s) => t + s.amount, 0))} of {peso(total(open))}</span>
		</div>
		{#if unfunded(open) > 0}
			<div class="mt-1 text-sm text-amber-700">Unfunded {peso(unfunded(open))}: add a source or raise an amount.</div>
		{/if}
		<div class="mt-5 flex gap-2 text-sm">
			<button class="rounded bg-gray-900 px-3 py-1.5 text-white" onclick={() => recordAll(open!)}>Record all</button>
			{#if open.ealloc && paidOf(open) === 0}<button class="rounded border px-3 py-1.5" onclick={() => { undoAllocation(open!); openId = null; }}>Undo allocation</button>{/if}
			<a class="rounded border px-3 py-1.5" href={open.plan}>Open plan ↗</a>
		</div>
	</aside>
{/if}

{#if adding}
	<div class="fixed inset-0 z-40 bg-black/20" role="presentation" onclick={() => (adding = null)}></div>
	<aside class="fixed top-0 right-0 z-40 h-full w-full max-w-md overflow-y-auto bg-white p-5 text-sm shadow-2xl">
		<button class="float-right text-gray-500" onclick={() => (adding = null)}>✕</button>
		<h3 class="text-lg font-semibold">New {adding === 'outflow' ? 'Outflow' : 'Inflow'}</h3>
		<div class="my-3 flex gap-1 border-b">
			<button class="-mb-px border-b-2 px-3 py-1.5 {mode === 'once' ? 'border-gray-900 font-medium' : 'border-transparent text-gray-500'}" onclick={() => (mode = 'once')}>One-off</button>
			<button class="-mb-px border-b-2 px-3 py-1.5 {mode === 'repeat' ? 'border-gray-900 font-medium' : 'border-transparent text-gray-500'}" onclick={() => (mode = 'repeat')}>Repeating</button>
		</div>
		{#if mode === 'once'}
			<p class="mb-2 text-xs text-gray-500">Saved as a Scheduled Transaction that happens once.</p>
			<label class="block">Description <input class="mt-0.5 w-full rounded border px-2 py-1" bind:value={draft.label} /></label>
			<label class="mt-2 block">{adding === 'outflow' ? 'Due' : 'Expected'} <input type="date" class="mt-0.5 w-full rounded border px-2 py-1" bind:value={draft.date} /></label>
			<label class="mt-2 block">Amount <input type="number" class="mt-0.5 w-full rounded border px-2 py-1" bind:value={draft.amount} /></label>
			<label class="mt-2 block">{adding === 'outflow' ? 'Paid from' : 'Lands in'}
				<select class="mt-0.5 w-full rounded border px-1 py-1 text-xs" bind:value={draft.account}>
					{#each f.accounts as a (a.id)}<option value={a.id} disabled={adding === 'outflow' && !a.funding}>{a.name}</option>{/each}
				</select>
			</label>
			{#if adding === 'outflow'}
				<label class="mt-2 block">Section
					<select class="mt-0.5 w-full rounded border px-1 py-1 text-xs" bind:value={draft.section}>
						<option>Important</option><option>Internal Transfers</option><option>Others</option>
					</select>
				</label>
			{/if}
			<button class="mt-4 rounded bg-gray-900 px-3 py-1.5 text-white" onclick={saveDraft}>Save</button>
		{:else}
			<div class="rounded-lg border border-dashed p-4 text-gray-500">The existing Scheduled plan form opens here (repeat rule, lines, Section).</div>
		{/if}
		{#if adding === 'outflow'}
			<p class="mt-4 text-xs text-gray-500">Installment Plan? <a class="underline" href="/installments/new">Create it on the Installments page ↗</a></p>
		{/if}
	</aside>
{/if}

{#if menu}
	{@const mo = f.outflows.find((o) => o.id === menu!.oid)!}
	<div class="fixed z-50 w-60 rounded-lg border bg-white py-1 text-sm shadow-xl" style="left: {menu.x}px; top: {menu.y}px" role="menu">
		<div class="px-3 py-1 text-xs text-gray-500">{mo.label}</div>
		<button class="block w-full px-3 py-1.5 text-left hover:bg-gray-100" onclick={() => ((onlyId = mo.id), (menu = null))}>Show in all Funding Accounts</button>
		<button class="block w-full px-3 py-1.5 text-left hover:bg-gray-100" onclick={() => ((openId = mo.id), (menu = null))}>Open</button>
		<button class="block w-full px-3 py-1.5 text-left hover:bg-gray-100" onclick={() => ((selectedId = copiedId = mo.id), (menu = null))}>Copy to another Funding Account <span class="float-right text-xs text-gray-400">Ctrl+C</span></button>
		<button class="block w-full px-3 py-1.5 text-left hover:bg-gray-100" onclick={() => (recordAll(mo), (menu = null))}>Record all</button>
		<a class="block w-full px-3 py-1.5 text-left hover:bg-gray-100" href={mo.plan}>Open plan ↗</a>
	</div>
{/if}

{#if paste}
	{@const po = f.outflows.find((o) => o.id === paste!.oid)!}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
		<div class="w-80 rounded-xl bg-white p-4 text-sm shadow-2xl">
			<h3 class="font-semibold">Add a paying source</h3>
			<p class="text-gray-500">{po.label} from <b>{accName(paste.lane)}</b>. Total {peso(total(po))}, unfunded {peso(unfunded(po))}.</p>
			<label class="mt-3 block">Amount <input type="number" class="mt-0.5 w-full rounded border px-2 py-1" bind:value={paste.amount} /></label>
			<div class="mt-3 flex justify-end gap-2">
				<button class="rounded border px-3 py-1" onclick={() => ((paste = null), (copiedId = null))}>Cancel</button>
				<button class="rounded bg-gray-900 px-3 py-1 text-white" onclick={confirmPaste}>Add</button>
			</div>
		</div>
	</div>
{/if}
