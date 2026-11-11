<script lang="ts">
	// A new Scheduled Transaction (plan).
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlanEditor from '#lib/components/PlanEditor.svelte';
	import { planCreatePlan, today, type PlanDraft } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const start = today();
	const initial: PlanDraft = {
		description: '',
		note: '',
		tags: [],
		from: [{ accountId: '', amount: '' }],
		to: [{ accountId: '', amount: '' }],
		fees: [],
		rule: { type: 'monthly', day: Number(start.slice(8)), start },
		end: { type: 'never' }
	};

	async function create(draft: PlanDraft) {
		const id = ledger.newScheduledId();
		await ledger.commit(planCreatePlan(ledger.chart, draft, { id, now: new Date() }));
		goto(resolve('/scheduled/[id]', { id }));
	}
</script>

<main class="max-w-4xl px-8 py-6">
	{#if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else}
		<PlanEditor {initial} heading="New plan" submitLabel="Create plan" onsubmit={create} />
	{/if}
</main>
