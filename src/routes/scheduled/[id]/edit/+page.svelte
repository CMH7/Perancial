<script lang="ts">
	// Edit a plan. With `?from=<due>` (from an occurrence): "This and all following", rule included.
	// Without it (from the Plans list): details on every version, rule untouched.
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PlanEditor from '#lib/components/PlanEditor.svelte';
	import {
		planChangeAll,
		planChangeFollowing,
		planDraftFrom,
		shortDate,
		versionFromDraft,
		type ChartWrite,
		type PlanDraft
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const plan = $derived(ledger.scheduled.find((p) => p.id === page.params.id));
	const from = $derived(page.url.searchParams.get('from'));
	const kept = $derived(new Set(plan?.versions.flatMap((v) => v.lines.map((l) => l.accountId))));
	const replaced = $derived(
		plan && from ? Object.keys(plan.occurrences).filter((d) => d >= from).length : 0
	);

	/** Both edits keep the end and the Forecast Section the editor shows. */
	const withEnd = (writes: ChartWrite[], draft: PlanDraft): ChartWrite[] =>
		writes.map((w) =>
			w.op === 'setScheduled'
				? { ...w, data: { ...w.data, end: draft.end, section: draft.section ?? null } }
				: w
		);

	async function save(draft: PlanDraft) {
		if (!plan) return;
		const now = new Date();
		const { rule, ...details } = versionFromDraft(ledger.chart, draft, kept);
		const writes = from
			? planChangeFollowing(plan, from, { ...details, rule }, { now }).writes
			: planChangeAll(plan, details, { now });
		await ledger.commit(withEnd(writes, draft));
		goto(resolve('/scheduled/[id]', { id: plan.id }));
	}
</script>

<main class="max-w-6xl page-pad">
	{#if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your plans…</p>
	{:else if !plan}
		<p class="text-sm text-gray-500">This plan no longer exists.</p>
	{:else}
		<a
			href={resolve('/scheduled/[id]', { id: plan.id })}
			class="mb-3 inline-block text-sm text-sky-700 hover:underline"
			>← {plan.versions.at(-1)!.description}</a
		>
		{#key `${plan.id}:${from}`}
			<PlanEditor
				initial={planDraftFrom(plan, from ?? undefined)}
				heading={from
					? `Change ${shortDate(from)} and all following`
					: `Edit every occurrence of ${plan.versions.at(-1)!.description}`}
				ruleLocked={!from}
				{kept}
				notice={replaced
					? `${replaced} ${replaced === 1 ? 'occurrence has its' : 'occurrences have their'} own changes from ${shortDate(from!)} on; saving replaces them.`
					: ''}
				onsubmit={save}
				oncancel={() => goto(resolve('/scheduled/[id]', { id: plan.id }))}
			/>
		{/key}
	{/if}
</main>
