<script lang="ts" module>
	export const name = 'List, then plan page with stats';
</script>

<script lang="ts">
	// PROTOTYPE: a compact plans list (progress, next due, balance); a plan opens its own page with
	// stat tiles on top and the row table below.
	import PlanTable from './PlanTable.svelte';
	import { isOverdue, peso, shortDate, summary, type Plan } from './proto.ts';

	let { plans = $bindable(), onNew }: { plans: Plan[]; onNew: () => void } = $props();
	let openId = $state<string | null>(null);
	const openIndex = $derived(plans.findIndex((p) => p.id === openId));
	const total = $derived(plans.reduce((s, p) => s + summary(p).balance, 0));
</script>

<main class="mx-auto max-w-5xl px-4 py-8">
	{#if openIndex < 0}
		<div class="mb-6 flex items-end justify-between">
			<div>
				<h1 class="text-2xl font-semibold">Installments</h1>
				<p class="text-sm text-gray-500">{peso(total)} left across {plans.length} plans</p>
			</div>
			<button class="rounded bg-gray-900 px-3 py-1.5 text-sm text-white" onclick={onNew}
				>New plan</button
			>
		</div>
		<ul class="divide-y rounded-xl border bg-white">
			{#each plans as plan (plan.id)}
				{@const s = summary(plan)}
				<li>
					<button
						class="grid w-full grid-cols-[1fr_10rem_9rem_8rem] items-center gap-4 px-5 py-3 text-left hover:bg-gray-50"
						onclick={() => (openId = plan.id)}
					>
						<div>
							<div class="font-medium">
								{plan.title}
								{#if plan.kind === 'internal'}<span
										class="ml-1 rounded bg-violet-100 px-1.5 text-xs text-violet-700">Internal</span
									>{/if}
							</div>
							<div class="text-xs text-gray-500">{plan.repaidAccount}</div>
						</div>
						<div>
							<div class="h-1.5 rounded bg-gray-100">
								<div
									class="h-1.5 rounded bg-green-500"
									style="width: {(100 * s.paidRows) / s.rowCount}%"
								></div>
							</div>
							<div class="mt-1 text-xs text-gray-500">{s.paidRows} of {s.rowCount} paid</div>
						</div>
						<div class="text-sm">
							{#if s.next}
								<span class={isOverdue(s.next) ? 'text-amber-700' : ''}>
									{isOverdue(s.next) ? 'Overdue' : 'Next'}
									{shortDate(s.next.date)}
								</span>
							{:else}<span class="text-green-700">Done</span>{/if}
						</div>
						<div class="text-right tabular-nums">
							<div class="font-semibold">{peso(s.balance)}</div>
							<div class="text-xs text-gray-500">of {peso(s.grandTotal)}</div>
						</div>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		{@const plan = plans[openIndex]}
		{@const s = summary(plan)}
		<button class="mb-4 text-sm text-gray-500" onclick={() => (openId = null)}
			>← Installments</button
		>
		<div class="mb-1 flex items-center justify-between">
			<h1 class="text-2xl font-semibold">{plan.title}</h1>
			<button class="text-sm text-gray-600" onclick={() => alert('PROTOTYPE: edit terms')}
				>Edit terms</button
			>
		</div>
		<p class="mb-4 text-sm text-gray-500">
			{plan.kind === 'internal' ? 'Internal, repays' : 'Owed in'}
			{plan.repaidAccount} · paid from {plan.payingAccount} · bought {shortDate(plan.purchaseDate)} ·
			{plan.entry}
		</p>
		<div class="mb-4 grid grid-cols-4 gap-3">
			{#each [['Amount', s.amount], ['Grand total', s.grandTotal], ['Balance', s.balance], ['Unpaid principal', s.unpaidPrincipal]] as [label, v] (label)}
				<div class="rounded-xl border bg-white p-3">
					<div class="text-xs text-gray-500 uppercase">{label}</div>
					<div class="text-lg font-semibold tabular-nums">{peso(+v)}</div>
				</div>
			{/each}
		</div>
		<div class="mb-4 grid grid-cols-2 gap-3 text-sm">
			{#each [['Interest', s.interest], ['Additionals', s.additionals]] as const as [label, x] (label)}
				<div class="rounded-xl border bg-white p-3">
					<div class="mb-1 text-xs text-gray-500 uppercase">{label}</div>
					Paid {peso(x.paid)} · left {peso(x.scheduled - x.paid)} · of {peso(x.scheduled)}
					{#if x.before}<div class="text-xs text-gray-500">
							{peso(x.before)} paid before tracking
						</div>{/if}
				</div>
			{/each}
		</div>
		{#if plan.kind === 'lender' && plan.id === 'claude'}
			<p class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
				Hint: {plan.repaidAccount} holds ₱4,000.00 but the unpaid principal is {peso(
					s.unpaidPrincipal
				)}. (Prototype sample of the mismatch hint.)
			</p>
		{/if}
		<div class="rounded-xl border bg-white p-4"><PlanTable bind:plan={plans[openIndex]} /></div>
	{/if}
</main>
