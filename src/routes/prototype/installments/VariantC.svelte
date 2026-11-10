<script lang="ts" module>
	export const name = 'Due by cut-off, plan in a drawer';
</script>

<script lang="ts">
	// PROTOTYPE: rows from every plan, grouped by Cut-off (15th / 30th), overdue first. Plans sit in a
	// side list; one opens in a drawer with its full table.
	import PlanTable from './PlanTable.svelte';
	import {
		isOverdue,
		peso,
		rowLeft,
		shortDate,
		summary,
		TODAY,
		type Plan,
		type Row
	} from './proto.ts';

	let { plans = $bindable(), onNew }: { plans: Plan[]; onNew: () => void } = $props();
	let drawer = $state<string | null>(null);
	let showPaid = $state(false);
	const drawerIndex = $derived(plans.findIndex((p) => p.id === drawer));

	const cutoff = (d: string) => {
		const [y, m, day] = d.split('-').map(Number);
		const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
		return `${y}-${String(m).padStart(2, '0')}-${String(day <= 15 ? 15 : Math.min(30, last)).padStart(2, '0')}`;
	};
	const groups = $derived.by(() => {
		const items = plans.flatMap((plan) =>
			plan.rows
				.filter((r) => r.state !== 'before' && (showPaid || r.state !== 'paid'))
				.map((r) => ({ plan, r }))
		);
		const map = new Map<string, { plan: Plan; r: Row }[]>();
		for (const it of items) {
			const key = isOverdue(it.r) ? 'overdue' : cutoff(it.r.date);
			map.set(key, [...(map.get(key) ?? []), it]);
		}
		return [...map.entries()].sort(([a], [b]) =>
			a === 'overdue' ? -1 : b === 'overdue' ? 1 : a.localeCompare(b)
		);
	});
</script>

<main class="mx-auto grid max-w-6xl grid-cols-[1fr_16rem] gap-6 px-4 py-8">
	<div>
		<div class="mb-4 flex items-center justify-between">
			<h1 class="text-2xl font-semibold">Installments due</h1>
			<label class="text-sm"><input type="checkbox" bind:checked={showPaid} /> Show paid</label>
		</div>
		{#each groups as [key, items] (key)}
			<section class="mb-5">
				<h2
					class="mb-1 flex justify-between text-sm font-semibold uppercase {key === 'overdue'
						? 'text-amber-700'
						: 'text-gray-500'}"
				>
					<span>{key === 'overdue' ? 'Overdue' : `Cut-off ${shortDate(key)}`}</span>
					<span class="tabular-nums">{peso(items.reduce((s, x) => s + rowLeft(x.r), 0))}</span>
				</h2>
				<ul class="divide-y rounded-xl border bg-white">
					{#each items as { plan, r } (plan.id + r.n)}
						<li class="flex items-center gap-3 px-4 py-2 text-sm">
							<span class="w-24 text-gray-500">{shortDate(r.date)}</span>
							<button class="flex-1 text-left" onclick={() => (drawer = plan.id)}>
								{plan.title} <span class="text-gray-400">#{r.n} of {plan.rows.at(-1)!.n}</span>
								{#if r.state === 'partly'}<span class="ml-1 text-xs text-sky-700">partly paid</span
									>{/if}
							</button>
							<span class="w-28 text-right tabular-nums"
								>{r.state === 'paid' ? '✓ paid' : peso(rowLeft(r))}</span
							>
							{#if r.state !== 'paid'}
								<button
									class="rounded bg-gray-900 px-2 py-0.5 text-xs text-white"
									onclick={() => alert(`PROTOTYPE: Record ${plan.title} #${r.n}`)}>Record</button
								>
							{:else}<span class="w-14"></span>{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		<p class="text-xs text-gray-400">Today is {shortDate(TODAY)} (stub).</p>
	</div>

	<aside>
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-gray-500 uppercase">Plans</h2>
			<button class="text-sm text-blue-700" onclick={onNew}>+ New</button>
		</div>
		<ul class="space-y-2">
			{#each plans as plan (plan.id)}
				{@const s = summary(plan)}
				<li>
					<button
						class="w-full rounded-xl border bg-white p-3 text-left text-sm hover:bg-gray-50"
						onclick={() => (drawer = plan.id)}
					>
						<div class="font-medium">{plan.title}</div>
						<div class="flex justify-between text-xs text-gray-500">
							<span>{s.paidRows}/{s.rowCount}</span><span class="tabular-nums"
								>{peso(s.balance)} left</span
							>
						</div>
					</button>
				</li>
			{/each}
		</ul>
	</aside>
</main>

{#if drawerIndex >= 0}
	{@const plan = plans[drawerIndex]}
	{@const s = summary(plan)}
	<div
		class="fixed inset-0 z-40 bg-black/20"
		onclick={() => (drawer = null)}
		role="presentation"
	></div>
	<div
		class="fixed top-0 right-0 bottom-0 z-40 w-[56rem] max-w-full overflow-y-auto bg-white p-6 shadow-xl"
	>
		<button class="float-right text-gray-500" onclick={() => (drawer = null)}>✕</button>
		<h2 class="text-xl font-semibold">{plan.title}</h2>
		<p class="mb-3 text-sm text-gray-500">
			{plan.repaidAccount} · Balance {peso(s.balance)} of {peso(s.grandTotal)} · Interest paid {peso(
				s.interest.paid
			)} of {peso(s.interest.scheduled)}
		</p>
		<PlanTable bind:plan={plans[drawerIndex]} />
	</div>
{/if}
