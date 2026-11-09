<script lang="ts">
	// The plan editor: the Transaction form's fields (amounts may be blank when they vary) plus the
	// repeat rule and when the plan ends. Checks come from the domain module.
	import {
		ACCOUNT_TYPE_GUIDE,
		evaluatePlanDraft,
		normalizeTag,
		type DraftLine,
		type LineSide,
		type PlanDraft,
		type RepeatRule
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let {
		initial,
		heading,
		ruleLocked = false,
		kept = new Set<string>(),
		notice = '',
		submitLabel = 'Save',
		onsubmit
	}: {
		initial: PlanDraft;
		heading: string;
		/** From the Plans list the rule stays; it changes only from an occurrence. */
		ruleLocked?: boolean;
		/** Archived Accounts the plan already uses, still allowed. */
		kept?: ReadonlySet<string>;
		notice?: string;
		submitLabel?: string;
		onsubmit: (draft: PlanDraft) => Promise<void>;
	} = $props();

	// svelte-ignore state_referenced_locally
	let draft = $state<PlanDraft>(structuredClone(initial));
	let tagText = $state('');
	let saving = $state(false);
	let saveError = $state('');
	let tried = $state(false);

	const chart = $derived(ledger.chart);
	const ev = $derived(evaluatePlanDraft(chart, draft, { kept }));
	const errorAt = $derived(new Map(ev.errors.map((e) => [e.at, e.message])));
	const shown = (at: string) => (tried ? errorAt.get(at) : undefined);

	const groups = $derived(
		ACCOUNT_TYPE_GUIDE.filter((g) => g.type !== 'equity').map((g) => ({
			...g,
			options: ledger.accounts
				.filter(
					(a) =>
						a.type === g.type &&
						!a.system &&
						!chart.isGroup(a.id) &&
						(!a.archived || kept.has(a.id))
				)
				.map((a) => ({
					id: a.id,
					label: chart
						.path(a.id)
						.slice(1)
						.map((p) => p.name)
						.join(' › ')
				}))
				.sort((a, b) => a.label.localeCompare(b.label))
		}))
	);
	const expenseGroups = $derived(groups.filter((g) => g.type === 'expense'));
	const blank = (): DraftLine => ({ accountId: '', amount: '' });

	// Switching the rule type keeps the start date where it can.
	function setRuleType(type: RepeatRule['type']) {
		const start = draft.rule.type === 'once' ? draft.rule.date : draft.rule.start;
		draft.rule =
			type === 'once'
				? { type, date: start }
				: type === 'monthly'
					? { type, day: Number(start.slice(8)) || 1, start }
					: type === 'weekly'
						? { type, every: 1, start }
						: { type, start };
	}

	function addTag() {
		for (const part of tagText.split(',')) {
			const tag = normalizeTag(part);
			if (tag && !draft.tags.includes(tag)) draft.tags.push(tag);
		}
		tagText = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		tried = true;
		if (ev.errors.length) return;
		saving = true;
		saveError = '';
		try {
			await onsubmit(draft);
		} catch (err) {
			saveError = `Could not save: ${(err as Error).message}`;
		} finally {
			saving = false;
		}
	}
</script>

{#snippet accountSelect(line: DraftLine, options = groups)}
	<select
		bind:value={line.accountId}
		aria-label="Account"
		class="min-w-0 flex-1 rounded border-gray-300 py-1 text-sm"
	>
		<option value="">Choose Account…</option>
		{#each options as g (g.type)}
			<optgroup label={g.label}>
				{#each g.options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
			</optgroup>
		{/each}
	</select>
{/snippet}

{#snippet lineErrors(side: LineSide, index: number)}
	{#each ['account', 'amount'] as part (part)}
		{@const message = shown(`${side}.${index}.${part}`)}
		{#if message}<p class="-mt-1 mb-2 text-xs text-red-600">{message}</p>{/if}
	{/each}
{/snippet}

{#snippet column(side: 'from' | 'to', label: string, lines: DraftLine[])}
	<section>
		<h2 class="mb-2 text-xs font-semibold text-gray-500 uppercase">{label}</h2>
		{#each lines as line, i (i)}
			<div class="mb-2 flex gap-2">
				{@render accountSelect(line)}
				<input
					bind:value={line.amount}
					inputmode="decimal"
					placeholder="varies"
					aria-label="Amount"
					class="w-32 rounded border-gray-300 text-right text-sm tabular-nums"
				/>
				{#if lines.length > 1}
					<button
						type="button"
						class="px-1 text-gray-400 hover:text-red-600"
						aria-label="Remove line"
						onclick={() => lines.splice(i, 1)}>✕</button
					>
				{/if}
			</div>
			{@render lineErrors(side, i)}
		{/each}
		<button
			type="button"
			class="text-sm text-sky-700 hover:underline"
			onclick={() => lines.push(blank())}
			>+ another {side === 'from' ? 'source' : 'destination'}</button
		>
	</section>
{/snippet}

<form onsubmit={submit} class="space-y-5 text-sm" novalidate>
	<h1 class="text-xl font-semibold">{heading}</h1>
	{#if notice}<p class="rounded-lg bg-amber-50 p-3 text-amber-900">{notice}</p>{/if}

	<label class="block">
		<span class="sr-only">Description</span>
		<input
			bind:value={draft.description}
			placeholder="Description"
			maxlength="200"
			class="w-full rounded border-gray-300 text-sm"
		/>
		{#if shown('description')}<span class="text-xs text-red-600">{shown('description')}</span>{/if}
	</label>

	<div class="grid gap-6 md:grid-cols-2">
		{@render column('from', 'From', draft.from)}
		{@render column('to', 'To', draft.to)}
	</div>

	<section class="rounded-lg bg-gray-50 p-3">
		<h2 class="mb-2 text-xs font-semibold text-gray-500 uppercase">Fees</h2>
		{#each draft.fees as fee, i (i)}
			<div class="mb-2 flex flex-wrap gap-2">
				<select
					bind:value={fee.mode}
					class="rounded border-gray-300 py-1 text-sm"
					aria-label="Fee type"
				>
					<option value="additional">Additional (on top of From)</option>
					<option value="less">Less (taken out of To)</option>
				</select>
				{@render accountSelect(fee, expenseGroups)}
				<input
					bind:value={fee.amount}
					inputmode="decimal"
					placeholder="varies"
					aria-label="Amount"
					class="w-28 rounded border-gray-300 text-right text-sm"
				/>
				<button
					type="button"
					class="px-1 text-gray-400 hover:text-red-600"
					aria-label="Remove fee"
					onclick={() => draft.fees.splice(i, 1)}>✕</button
				>
			</div>
			{@render lineErrors('fees', i)}
		{/each}
		<button
			type="button"
			class="text-sm text-sky-700 hover:underline"
			onclick={() => draft.fees.push({ ...blank(), mode: 'additional' })}>+ fee</button
		>
	</section>
	<p class="text-xs text-gray-500">
		Leave an amount blank when it varies; you fill it in per occurrence or when recording.
	</p>
	{#if shown('total')}<p class="text-xs text-red-600">{shown('total')}</p>{/if}

	<fieldset class="space-y-2 rounded-lg border p-3" disabled={ruleLocked}>
		<legend class="px-1 text-xs font-semibold text-gray-500 uppercase">Repeats</legend>
		{#if ruleLocked}<p class="text-xs text-gray-500">
				To change the rule, edit from an occurrence and choose "This and all following".
			</p>{/if}
		<div class="flex flex-wrap items-center gap-2">
			<select
				value={draft.rule.type}
				onchange={(e) => setRuleType(e.currentTarget.value as RepeatRule['type'])}
				aria-label="Repeat rule"
				class="rounded border-gray-300 py-1 text-sm"
			>
				<option value="once">Once</option>
				<option value="cutoff">Every cut-off (15th and 30th)</option>
				<option value="monthly">Monthly</option>
				<option value="weekly">Every N weeks</option>
				<option value="yearly">Yearly</option>
			</select>
			{#if draft.rule.type === 'once'}
				<label
					>on <input
						type="date"
						bind:value={draft.rule.date}
						class="rounded border-gray-300 py-1 text-sm"
					/></label
				>
			{:else}
				{#if draft.rule.type === 'monthly'}
					<label
						>on day <input
							type="number"
							min="1"
							max="31"
							bind:value={draft.rule.day}
							class="w-16 rounded border-gray-300 py-1 text-sm"
						/></label
					>
				{:else if draft.rule.type === 'weekly'}
					<label
						>every <input
							type="number"
							min="1"
							max="52"
							bind:value={draft.rule.every}
							class="w-16 rounded border-gray-300 py-1 text-sm"
						/> weeks</label
					>
				{/if}
				<label
					>starting <input
						type="date"
						bind:value={draft.rule.start}
						class="rounded border-gray-300 py-1 text-sm"
					/></label
				>
			{/if}
		</div>
		{#if shown('rule')}<p class="text-xs text-red-600">{shown('rule')}</p>{/if}
	</fieldset>

	<fieldset class="flex flex-wrap items-center gap-2 rounded-lg border p-3">
		<legend class="px-1 text-xs font-semibold text-gray-500 uppercase">Ends</legend>
		<select
			value={draft.end.type}
			onchange={(e) => {
				const type = e.currentTarget.value;
				draft.end =
					type === 'on'
						? { type, date: '' }
						: type === 'after'
							? { type, count: 12 }
							: { type: 'never' };
			}}
			aria-label="Plan ends"
			class="rounded border-gray-300 py-1 text-sm"
		>
			<option value="never">Never</option>
			<option value="on">On a date</option>
			<option value="after">After a number of occurrences</option>
		</select>
		{#if draft.end.type === 'on'}
			<input
				type="date"
				bind:value={draft.end.date}
				aria-label="End date"
				class="rounded border-gray-300 py-1 text-sm"
			/>
		{:else if draft.end.type === 'after'}
			<input
				type="number"
				min="1"
				bind:value={draft.end.count}
				aria-label="Number of occurrences"
				class="w-20 rounded border-gray-300 py-1 text-sm"
			/>
		{/if}
		{#if shown('end')}<p class="w-full text-xs text-red-600">{shown('end')}</p>{/if}
	</fieldset>

	<div class="flex flex-wrap items-center gap-2">
		{#each draft.tags as tag, i (tag)}
			<span class="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
				>#{tag}<button
					type="button"
					class="text-gray-400 hover:text-red-600"
					aria-label="Remove tag {tag}"
					onclick={() => draft.tags.splice(i, 1)}>✕</button
				></span
			>
		{/each}
		<input
			bind:value={tagText}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ',') {
					e.preventDefault();
					addTag();
				}
			}}
			onblur={addTag}
			placeholder="Add tag"
			class="w-40 rounded border-gray-300 py-1 text-sm"
		/>
	</div>

	<textarea
		bind:value={draft.note}
		placeholder="Note (optional)"
		rows="2"
		class="w-full rounded border-gray-300 text-sm"></textarea>

	{#if saveError}<p class="text-red-600">{saveError}</p>{/if}
	{#if tried && ev.errors.length}<p class="text-xs text-red-600">
			Fix the highlighted fields first.
		</p>{/if}
	<div class="flex justify-end">
		<button disabled={saving} class="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-40"
			>{saving ? 'Saving…' : submitLabel}</button
		>
	</div>
</form>
