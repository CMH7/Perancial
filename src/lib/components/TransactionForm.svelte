<script lang="ts">
	// The Transaction form: new, edit, and "Copy from". Rules and arithmetic come from the domain
	// module; this component only shows them and collects input.
	import {
		ACCOUNT_TYPE_GUIDE,
		duplicateDraft,
		evaluateDraft,
		formatAmount,
		normalizeTag,
		planSaveTransaction,
		today,
		type DraftLine,
		type LineSide,
		type Transaction,
		type TransactionDraft,
		type TransactionKind
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		initial,
		existing,
		onsaved
	}: {
		initial: TransactionDraft;
		/** The Transaction being edited; absent for a new one. */
		existing?: Transaction;
		onsaved: (id: string) => void;
	} = $props();

	// svelte-ignore state_referenced_locally
	let draft = $state<TransactionDraft>(structuredClone(initial));
	let tagText = $state('');
	let copyFrom = $state('');
	let saving = $state(false);
	let saveError = $state('');
	/** Fields and lines the user has touched; their errors show from then on. */
	const touched = new SvelteSet<string>();
	const touch = (key: string) => touched.add(key);

	const chart = $derived(ledger.chart);
	const todayIso = today();
	const ev = $derived(evaluateDraft(chart, draft, { today: todayIso, existing }));
	const errorAt = $derived(new Map(ev.errors.map((e) => [e.at, e.message])));
	const shown = (at: string) => {
		const [field, index] = at.split('.');
		return touched.has(index === undefined ? field : `${field}.${index}`)
			? errorAt.get(at)
			: undefined;
	};

	const KIND: Record<TransactionKind, { label: string; style: string }> = {
		expense: { label: 'Expense', style: 'bg-rose-100 text-rose-800' },
		income: { label: 'Income', style: 'bg-emerald-100 text-emerald-800' },
		transfer: { label: 'Transfer', style: 'bg-sky-100 text-sky-800' },
		'income-and-expense': { label: 'Income and Expense', style: 'bg-violet-100 text-violet-800' }
	};

	// Leaf Accounts by Account Type, as full paths. Archived ones only when this Transaction uses them.
	const kept = $derived(new Set(existing?.entries.map((e) => e.accountId)));
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
					label:
						chart
							.path(a.id)
							.slice(1)
							.map((p) => p.name)
							.join(' › ') + (a.archived ? ' (archived)' : '')
				}))
				.sort((a, b) => a.label.localeCompare(b.label))
		}))
	);
	const expenseGroup = $derived(groups.filter((g) => g.type === 'expense'));

	const pastTransactions = $derived(
		ledger.transactions
			.filter((t) => t.origin === 'normal')
			.toSorted((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || +b.createdAt - +a.createdAt)
	);
	const knownTags = $derived(
		[...new Set(ledger.transactions.flatMap((t) => t.tags))]
			.filter((t) => !draft.tags.includes(t))
			.sort()
	);

	function copy() {
		const tx = ledger.transactions.find((t) => t.id === copyFrom);
		copyFrom = '';
		if (!tx) return;
		draft = duplicateDraft(tx, { today: todayIso });
		touched.clear();
	}

	function addTag() {
		for (const part of tagText.split(',')) {
			const tag = normalizeTag(part);
			if (tag && !draft.tags.includes(tag)) draft.tags.push(tag);
		}
		tagText = '';
	}

	const placeholder = (side: LineSide, index: number) =>
		ev.filled?.side === side && ev.filled.index === index
			? formatAmount(ev.filled.amount).replace('₱', '')
			: '0.00';
	const isFilled = (side: LineSide, index: number) =>
		ev.filled?.side === side && ev.filled.index === index;
	const blank = (): DraftLine => ({ accountId: '', amount: '' });

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (ev.errors.length) return;
		saving = true;
		saveError = '';
		try {
			const id = existing?.id ?? ledger.newTransactionId();
			await ledger.commit(
				planSaveTransaction(chart, draft, { id, now: new Date(), today: todayIso, existing })
			);
			onsaved(id);
		} catch (err) {
			saveError = `Could not save: ${(err as Error).message}`;
		} finally {
			saving = false;
		}
	}
</script>

{#snippet accountSelect(side: LineSide, index: number, line: DraftLine, options = groups)}
	<select
		bind:value={line.accountId}
		onchange={() => touch(`${side}.${index}`)}
		class="min-w-0 flex-1 rounded border-gray-300 py-1 text-sm"
		aria-label="Account"
	>
		<option value="">Choose Account…</option>
		{#each options as g (g.type)}
			<optgroup label={g.label}>
				{#each g.options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
			</optgroup>
		{/each}
	</select>
{/snippet}

{#snippet amountInput(side: LineSide, index: number, line: DraftLine)}
	<input
		bind:value={line.amount}
		oninput={() => touch(`${side}.${index}`)}
		inputmode="decimal"
		placeholder={placeholder(side, index)}
		aria-label="Amount"
		class="w-32 rounded border-gray-300 text-right text-sm tabular-nums {isFilled(side, index)
			? 'bg-amber-50 placeholder:text-amber-700'
			: ''}"
	/>
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
				{@render accountSelect(side, i, line)}
				{@render amountInput(side, i, line)}
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
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<h1 class="text-xl font-semibold">{existing ? 'Edit Transaction' : 'New Transaction'}</h1>
			{#if ev.kind}
				<span class="rounded-full px-2 py-0.5 text-xs font-medium {KIND[ev.kind].style}"
					>{KIND[ev.kind].label}</span
				>
			{/if}
		</div>
		<select
			bind:value={copyFrom}
			onchange={copy}
			class="max-w-xs rounded border-gray-300 py-1 text-sm"
		>
			<option value="">Copy from a past Transaction…</option>
			{#each pastTransactions as t (t.id)}
				<option value={t.id}
					>{t.date} · {t.description} · {formatAmount(
						t.entries.reduce((s, e) => s + Math.max(e.amount, 0), 0)
					)}</option
				>
			{/each}
		</select>
	</div>

	<div class="grid grid-cols-[11rem_1fr] gap-3">
		<label>
			<span class="sr-only">Date</span>
			<input
				type="date"
				bind:value={draft.date}
				max={todayIso}
				onchange={() => touch('date')}
				class="w-full rounded border-gray-300 text-sm"
			/>
			{#if shown('date')}<span class="text-xs text-red-600">{shown('date')}</span>{/if}
		</label>
		<label>
			<span class="sr-only">Description</span>
			<input
				bind:value={draft.description}
				oninput={() => touch('description')}
				placeholder="Description"
				maxlength="200"
				class="w-full rounded border-gray-300 text-sm"
			/>
			{#if shown('description')}<span class="text-xs text-red-600">{shown('description')}</span
				>{/if}
		</label>
	</div>

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
				{@render accountSelect('fees', i, fee, expenseGroup)}
				{@render amountInput('fees', i, fee)}
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

	<div class="flex flex-wrap items-baseline justify-between gap-2 text-gray-600">
		<p class="text-xs">Leave one amount blank and it fills with what is left (amber).</p>
		<p class="tabular-nums">
			From {formatAmount(ev.fromTotal)} · To {formatAmount(ev.toTotal)}
			{#if errorAt.get('total') && (touched.size > 0 || existing)}
				<span class="block text-right text-xs text-red-600">{errorAt.get('total')}</span>
			{/if}
		</p>
	</div>

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
			list="known-tags"
			placeholder="Add tag"
			class="w-40 rounded border-gray-300 py-1 text-sm"
		/>
		<datalist id="known-tags">
			{#each knownTags as tag (tag)}<option value={tag}></option>{/each}
		</datalist>
		<label class="ml-auto flex items-center gap-2">
			<input
				type="checkbox"
				checked={draft.status === 'pending'}
				onchange={(e) => (draft.status = e.currentTarget.checked ? 'pending' : 'cleared')}
			/>
			Pending
		</label>
	</div>

	<label class="block">
		<span class="sr-only">Note</span>
		<textarea
			bind:value={draft.note}
			oninput={() => touch('note')}
			placeholder="Note (optional)"
			rows="3"
			class="w-full rounded border-gray-300 text-sm"></textarea>
		{#if shown('note')}<span class="text-xs text-red-600">{shown('note')}</span>{/if}
	</label>

	{#if saveError}<p class="text-red-600">{saveError}</p>{/if}
	<div class="flex justify-end">
		<button
			disabled={ev.errors.length > 0 || saving}
			class="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-40"
			>{saving ? 'Saving…' : 'Save'}</button
		>
	</div>
</form>
