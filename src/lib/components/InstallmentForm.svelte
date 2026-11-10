<script lang="ts">
	// The create form for an Installment Plan: terms on the left, a live row preview on the right.
	// Rules and arithmetic come from the domain module; this component only shows and collects.
	import {
		evaluateInstallmentDraft,
		formatAmount,
		normalizeTag,
		rowTotal,
		shortDate,
		type InstallmentDraft
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { SvelteSet } from 'svelte/reactivity';

	let {
		initial,
		today,
		startedOn,
		onsubmit
	}: {
		initial: InstallmentDraft;
		today: string;
		startedOn: string;
		onsubmit: (draft: InstallmentDraft) => Promise<void>;
	} = $props();

	// svelte-ignore state_referenced_locally
	let d = $state<InstallmentDraft>(structuredClone(initial));
	let tagText = $state('');
	let saving = $state(false);
	let saveError = $state('');
	let tried = $state(false);
	const touched = new SvelteSet<string>();

	const chart = $derived(ledger.chart);
	const ev = $derived(
		evaluateInstallmentDraft(chart, ledger.installments, d, { today, startedOn })
	);
	const errorAt = $derived(new Map(ev.errors.map((e) => [e.at, e.message])));
	const shown = (at: string) => (tried || touched.has(at) ? errorAt.get(at) : undefined);

	const label = (id: string) =>
		chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ') ||
		chart.account(id)?.name ||
		'';
	const live = $derived(
		ledger.accounts.filter((a) => !a.archived && a.system !== 'opening-balances')
	);
	const leaves = (type: string) =>
		live
			.filter((a) => a.type === type && !a.system && !chart.isGroup(a.id))
			.map((a) => ({ id: a.id, label: label(a.id) }))
			.sort((a, b) => a.label.localeCompare(b.label));
	const usedLiabilities = $derived(
		new Set(ledger.installments.filter((p) => p.kind === 'lender').map((p) => p.accounts.repaid))
	);
	const liabilityParents = $derived(
		live
			.filter((a) => a.type === 'liability')
			.map((a) => ({
				id: a.id,
				label: a.system === 'root' ? 'Liabilities' : `Liabilities › ${label(a.id)}`
			}))
			.sort((a, b) => a.label.localeCompare(b.label))
	);
	const freeLiabilities = $derived(leaves('liability').filter((o) => !usedLiabilities.has(o.id)));
	const assets = $derived(leaves('asset'));
	const expenses = $derived(leaves('expense'));
	const payers = $derived([...leaves('asset'), ...leaves('liability')]);

	// Keep one varied row draft per previewed row.
	const rowCount = $derived(Math.max(0, d.count) + (d.rowZero ? 1 : 0));
	$effect(() => {
		while (d.varied.length < rowCount) d.varied.push({ principal: '', interest: '' });
	});

	function addTag() {
		const tag = normalizeTag(tagText);
		if (tag && !d.tags.includes(tag)) d.tags.push(tag);
		tagText = '';
	}
	function addAdditional(n: number) {
		(d.additionals[n] ??= []).push({ description: '', amount: '' });
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		tried = true;
		if (ev.errors.length) return;
		saving = true;
		saveError = '';
		try {
			await onsubmit($state.snapshot(d));
		} catch (err) {
			saveError = `Could not save: ${(err as Error).message}`;
		} finally {
			saving = false;
		}
	}
	const field = 'mt-1 w-full rounded border-gray-300 py-1 text-sm';
	const peso = (c: number) => formatAmount(c);
</script>

{#snippet error(at: string)}
	{#if shown(at)}<p class="mt-1 text-xs text-red-700">{shown(at)}</p>{/if}
{/snippet}

{#snippet select(
	value: string,
	options: { id: string; label: string }[],
	set: (v: string) => void,
	placeholder: string
)}
	<select class={field} {value} onchange={(e) => set(e.currentTarget.value)}>
		<option value="">{placeholder}</option>
		{#each options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
	</select>
{/snippet}

<form class="grid gap-6 md:grid-cols-2" onsubmit={submit}>
	<div class="space-y-4 text-sm">
		<div class="flex gap-2">
			{#each [['lender', 'Owed to a lender'], ['internal', 'Internal (repays my Asset)']] as const as [k, text] (k)}
				<button
					type="button"
					class="flex-1 rounded border px-2 py-1.5 {d.kind === k
						? 'border-gray-900 bg-gray-900 text-white'
						: 'bg-white'}"
					onclick={() => (d.kind = k)}>{text}</button
				>
			{/each}
		</div>

		<label class="block"
			>Title <input class={field} bind:value={d.title} onblur={() => touched.add('title')} />
			{@render error('title')}
		</label>

		<div>
			Tags
			<div class="mt-1 flex flex-wrap items-center gap-1">
				{#each d.tags as tag, i (tag)}
					<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs"
						>#{tag}
						<button type="button" class="ml-0.5 text-gray-500" onclick={() => d.tags.splice(i, 1)}
							>×</button
						></span
					>
				{/each}
				<input
					class="min-w-24 flex-1 rounded border-gray-300 py-0.5 text-sm"
					placeholder="Add a tag"
					bind:value={tagText}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ',') {
							e.preventDefault();
							addTag();
						}
					}}
					onblur={addTag}
				/>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<label
				>Purchase date <input type="date" class={field} bind:value={d.purchaseDate} />
				{@render error('purchaseDate')}</label
			>
			<label
				>First payment <input type="date" class={field} bind:value={d.firstDate} />
				{@render error('firstDate')}</label
			>
			<label
				>Repeats
				<select class={field} bind:value={d.repeat}>
					<option value="monthly">Monthly on day {d.firstDate.slice(8) || '…'}</option>
					<option value="cutoff">Every cut-off (15th and 30th)</option>
					<option value="weekly">Every N weeks</option>
				</select>
				{@render error('repeat')}
			</label>
			{#if d.repeat === 'weekly'}
				<label
					>Every <input type="number" min="1" max="52" class={field} bind:value={d.everyWeeks} /> weeks</label
				>
			{/if}
			<label
				>Payments <input type="number" min="1" class={field} bind:value={d.count} />
				{@render error('count')}</label
			>
		</div>

		<label class="flex items-center gap-2"
			><input type="checkbox" bind:checked={d.rowZero} /> Starts with an interest/fee-only row 0</label
		>

		<div class="flex gap-4">
			<label><input type="radio" bind:group={d.entry} value="flat" /> Flat</label>
			<label
				><input type="radio" bind:group={d.entry} value="varied" /> Varied (type each row)</label
			>
		</div>
		{#if d.entry === 'flat'}
			<div class="grid grid-cols-2 gap-3">
				<label
					>Amount (principal) <input
						class={field}
						inputmode="decimal"
						bind:value={d.amount}
						onblur={() => touched.add('amount')}
					/>
					{@render error('amount')}</label
				>
				<label
					>Interest per row <input
						class={field}
						inputmode="decimal"
						placeholder="None"
						bind:value={d.interest}
					/>
					{@render error('interest')}</label
				>
			</div>
		{/if}

		{#if ev.inProgress}
			<div class="rounded-lg bg-amber-50 p-3">
				<label
					>The first payment is in the past. Track from row
					<select
						class="ml-1 rounded border-gray-300 py-0.5 text-sm"
						value={ev.trackedFrom}
						onchange={(e) => (d.trackedFrom = Number(e.currentTarget.value))}
					>
						{#each ev.rows as r (r.n)}<option value={r.n}>{r.n} ({shortDate(r.date)})</option
							>{/each}
					</select>
				</label>
				<p class="mt-1 text-xs text-amber-900">
					Earlier rows are Before tracking: your Opening Balances already cover them. Principal
					still owed: {peso(ev.trackedPrincipal)}.
				</p>
			</div>
		{/if}

		<fieldset class="space-y-3 rounded-lg border p-3">
			{#if d.kind === 'lender'}
				<legend class="px-1 text-xs text-gray-500 uppercase">Liability</legend>
				<div class="flex gap-4">
					<label
						><input
							type="radio"
							checked={d.liability.mode === 'new'}
							onchange={() =>
								(d.liability = {
									mode: 'new',
									parentId: '',
									name: d.title,
									historyName: 'Card spending'
								})}
						/> New Account</label
					>
					<label
						><input
							type="radio"
							checked={d.liability.mode === 'pick'}
							onchange={() => (d.liability = { mode: 'pick', accountId: '' })}
						/> Pick existing</label
					>
				</div>
				{#if d.liability.mode === 'pick'}
					{@const l = d.liability}
					{@render select(
						l.accountId,
						freeLiabilities,
						(v) => (l.accountId = v),
						'Choose a Liability…'
					)}
				{:else}
					{@const l = d.liability}
					<label class="block"
						>Under {@render select(
							l.parentId,
							liabilityParents,
							(v) => (l.parentId = v),
							'Choose where…'
						)}</label
					>
					<label class="block"
						>Name <input class={field} bind:value={l.name} placeholder={d.title} /></label
					>
					{#if ev.parentHoldsMoney}
						<label class="block text-xs"
							>"{chart.account(l.parentId)?.name}" holds spending. Keep that history as
							<input class={field} bind:value={l.historyName} /></label
						>
					{/if}
				{/if}
				{@render error('liability')}
				{#if ev.inProgress}
					<div class="text-xs">
						Is what is still owed already in the card's Opening Balance?
						<label class="ml-2"
							><input type="radio" bind:group={d.inCardBalance} value={true} /> Yes</label
						>
						<label class="ml-2"
							><input type="radio" bind:group={d.inCardBalance} value={false} /> No</label
						>
					</div>
				{/if}
				<div class="grid grid-cols-2 gap-3">
					<label
						>Interest Account {@render select(
							d.interestId,
							expenses,
							(v) => (d.interestId = v),
							'Auto: Finance charges'
						)}
						{@render error('interest')}</label
					>
					<label
						>Fees Account {@render select(
							d.feesId,
							expenses,
							(v) => (d.feesId = v),
							'Auto: Finance charges'
						)}
						{@render error('fees')}</label
					>
				</div>
			{:else}
				<legend class="px-1 text-xs text-gray-500 uppercase">Repaid Asset</legend>
				{@render select(
					d.repaidAssetId,
					assets,
					(v) => (d.repaidAssetId = v),
					'Choose the Asset this repays…'
				)}
				{@render error('repaid')}
			{/if}
			<label class="block"
				>Paid from {@render select(
					d.payingId,
					payers,
					(v) => (d.payingId = v),
					'Choose an Account…'
				)}
				{@render error('paying')}</label
			>
		</fieldset>

		<label class="block"
			>Note <textarea class={field} rows="2" bind:value={d.note}></textarea></label
		>

		{#if saveError}<p class="text-sm text-red-700">{saveError}</p>{/if}
		{#if tried && ev.errors.length}<p class="text-sm text-red-700">
				Fix the marked fields first.
			</p>{/if}
		<button class="rounded bg-gray-900 px-4 py-1.5 text-white disabled:opacity-50" disabled={saving}
			>{saving ? 'Saving…' : 'Create plan'}</button
		>
	</div>

	<div>
		<h2 class="mb-2 text-xs font-semibold text-gray-500 uppercase">
			Preview: {ev.rows.length} rows, {peso(ev.rows.reduce((s, r) => s + rowTotal(r), 0))}
		</h2>
		<table class="w-full text-xs">
			<thead class="text-left text-gray-500">
				<tr
					><th>#</th><th>Date</th><th class="text-right">Principal</th><th class="text-right"
						>Interest</th
					><th>Additionals</th></tr
				>
			</thead>
			<tbody>
				{#each ev.rows as r, i (r.n)}
					<tr class="border-b align-top {r.n < ev.trackedFrom ? 'text-gray-400' : ''}">
						<td class="py-1 font-mono">{r.n}</td>
						<td>{shortDate(r.date)}</td>
						{#if d.entry === 'varied' && d.varied[i]}
							<td class="text-right"
								><input
									class="w-24 rounded border-gray-300 py-0 text-right text-xs"
									inputmode="decimal"
									bind:value={d.varied[i].principal}
								/>
								{@render error(`rows.${i}.principal`)}</td
							>
							<td class="text-right"
								><input
									class="w-20 rounded border-gray-300 py-0 text-right text-xs"
									inputmode="decimal"
									bind:value={d.varied[i].interest}
								/>
								{@render error(`rows.${i}.interest`)}</td
							>
						{:else}
							<td class="text-right tabular-nums">{peso(r.principal)}</td>
							<td class="text-right tabular-nums">{r.interest ? peso(r.interest) : ''}</td>
						{/if}
						<td class="pl-2">
							{#each d.additionals[r.n] ?? [] as a, k (k)}
								<div class="flex gap-1">
									<input
										class="w-24 rounded border-gray-300 py-0 text-xs"
										placeholder="Processing fee"
										bind:value={a.description}
									/>
									<input
										class="w-16 rounded border-gray-300 py-0 text-right text-xs"
										inputmode="decimal"
										bind:value={a.amount}
									/>
									<button
										type="button"
										class="text-gray-500"
										onclick={() => d.additionals[r.n].splice(k, 1)}>×</button
									>
								</div>
								{@render error(`additionals.${r.n}.${k}`)}
							{/each}
							<button type="button" class="text-blue-700" onclick={() => addAdditional(r.n)}
								>+ add</button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{@render error('rows')}
	</div>
</form>
