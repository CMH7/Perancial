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

<main class="max-w-6xl page-pad">
	{#if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your accounts…</p>
	{:else}
		<a href={resolve('/scheduled')} class="mb-3 inline-block text-sm text-sky-700 hover:underline"
			>← Scheduled</a
		>
		<PlanEditor
			{initial}
			heading="New plan"
			submitLabel="Create plan"
			onsubmit={create}
			oncancel={() => goto(resolve('/scheduled'))}
		/>
	{/if}
</main>
