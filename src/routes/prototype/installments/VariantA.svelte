<script lang="ts" module>
	export const name = 'Sheet: every plan stacked';
</script>

<script lang="ts">
	// PROTOTYPE: mirrors the Google Sheet. One block per plan: terms left, rows middle, totals right.
	import PlanTable from './PlanTable.svelte';
	import { peso, shortDate, summary, type Plan } from './proto.ts';

	let { plans = $bindable(), onNew }: { plans: Plan[]; onNew: () => void } = $props();
	let hideDone = $state(false);
</script>

<main class="mx-auto max-w-7xl px-4 py-8">
	<div class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-semibold">Installments</h1>
		<div class="flex items-center gap-3 text-sm">
			<label><input type="checkbox" bind:checked={hideDone} /> Hide finished</label>
			<button class="rounded bg-gray-900 px-3 py-1.5 text-white" onclick={onNew}>New plan</button>
		</div>
	</div>

	{#each plans as plan, i (plan.id)}
		{@const s = summary(plan)}
		{#if !(hideDone && s.balance === 0)}
			<section
				class="mb-6 grid grid-cols-[14rem_1fr_11rem] overflow-hidden rounded-xl border bg-white"
			>
				<div class="flex flex-col justify-center gap-1 border-r bg-amber-50 p-4 text-center">
					<div class="font-semibold">{plan.title}</div>
					<div class="text-xs text-gray-500">{plan.tags.map((t) => `#${t}`).join(' ')}</div>
					<div class="mt-2 tabular-nums">{peso(s.amount)}</div>
					<div class="text-xs text-gray-500">bought {shortDate(plan.purchaseDate)}</div>
					<div class="mt-2 text-xs">
						<span class="rounded border bg-white px-1.5 py-0.5">
							{plan.kind === 'internal' ? 'Internal' : 'Lender'} · {plan.entry}
						</span>
					</div>
					<div class="mt-1 text-xs text-gray-500">{plan.repaidAccount}</div>
				</div>
				<div class="p-3"><PlanTable bind:plan={plans[i]} /></div>
				<div class="flex flex-col justify-center gap-4 border-l bg-amber-50 p-4 text-center">
					<div>
						<div class="text-xs text-gray-500 uppercase">Grand total</div>
						<div class="text-lg font-bold tabular-nums">{peso(s.grandTotal)}</div>
					</div>
					<div>
						<div class="text-xs text-gray-500 uppercase">Balance</div>
						<div class="text-lg font-bold tabular-nums">{peso(s.balance)}</div>
					</div>
					<div class="text-xs text-gray-600">
						Interest {peso(s.interest.paid)} / {peso(s.interest.scheduled)}<br />
						Additionals {peso(s.additionals.paid)} / {peso(s.additionals.scheduled)}
					</div>
				</div>
			</section>
		{/if}
	{/each}
</main>
