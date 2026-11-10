<script lang="ts">
	// Edit an Installment Plan's terms (title, tags, note, purchase date, Accounts). Rows are edited
	// one at a time on the plan page. Checks come from the domain module.
	import {
		normalizeTag,
		planEditTerms,
		type Installment,
		type TermsPatch
	} from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import { accountItems } from '#lib/account-items.svelte.ts';
	import AccountPicker from './AccountPicker.svelte';
	import SectionPicker from './SectionPicker.svelte';

	let { plan, onclose }: { plan: Installment; onclose: () => void } = $props();

	// svelte-ignore state_referenced_locally
	let t = $state<Required<TermsPatch>>(
		structuredClone({
			title: plan.title,
			tags: plan.tags,
			note: plan.note,
			purchaseDate: plan.purchaseDate,
			accounts: plan.accounts,
			section: plan.section ?? null
		})
	);
	let tagText = $state('');
	let error = $state('');
	let busy = $state(false);

	const chart = $derived(ledger.chart);
	const label = (id: string) =>
		chart
			.path(id)
			.slice(1)
			.map((a) => a.name)
			.join(' › ');
	const leaves = (types: string[]) =>
		ledger.accounts
			.filter((a) => types.includes(a.type) && !a.system && !chart.isGroup(a.id))
			.filter((a) => !a.archived || Object.values(plan.accounts).includes(a.id))
			.map((a) => ({ id: a.id, label: label(a.id) }))
			.sort((a, b) => a.label.localeCompare(b.label));
	const held = $derived(
		new Set(
			ledger.installments
				.filter((p) => p.id !== plan.id && p.kind === 'lender')
				.map((p) => p.accounts.repaid)
		)
	);
	const repaidOptions = $derived(
		plan.kind === 'lender'
			? leaves(['liability']).filter((o) => !held.has(o.id))
			: leaves(['asset'])
	);

	function addTag() {
		const tag = normalizeTag(tagText);
		if (tag && !t.tags.includes(tag)) t.tags.push(tag);
		tagText = '';
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		busy = true;
		try {
			const patch = $state.snapshot(t);
			await ledger.commit(
				planEditTerms(chart, ledger.installments, plan, patch, { now: new Date() })
			);
			onclose();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
	const field = 'mt-1 w-full rounded border-gray-300 py-1 text-sm';
</script>

{#snippet select(
	value: string | null,
	options: { id: string; label: string }[],
	set: (v: string) => void
)}
	<AccountPicker
		value={value ?? ''}
		items={accountItems.for(options.map((o) => o.id))}
		onchange={set}
		class="mt-1 w-full"
	/>
{/snippet}

<form class="space-y-3 text-sm" onsubmit={save}>
	<h2 class="text-lg font-semibold">Edit terms</h2>
	<label class="block">Title <input class={field} bind:value={t.title} /></label>
	<SectionPicker value={t.section} onchange={(id) => (t.section = id)} />
	<div>
		Tags
		<div class="mt-1 flex flex-wrap items-center gap-1">
			{#each t.tags as tag, i (tag)}
				<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs"
					>#{tag}
					<button type="button" class="text-gray-500" onclick={() => t.tags.splice(i, 1)}>×</button
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
	<label class="block"
		>Purchase date <input type="date" class={field} bind:value={t.purchaseDate} /></label
	>
	<label class="block"
		>{plan.kind === 'lender' ? 'Liability' : 'Repaid Asset'}
		{@render select(t.accounts.repaid, repaidOptions, (v) => (t.accounts.repaid = v))}
	</label>
	<label class="block"
		>Paid from {@render select(
			t.accounts.paying,
			leaves(['asset', 'liability']),
			(v) => (t.accounts.paying = v)
		)}
	</label>
	{#if plan.kind === 'lender'}
		<div class="grid grid-cols-2 gap-3">
			<label
				>Interest Account {@render select(
					t.accounts.interest,
					leaves(['expense']),
					(v) => (t.accounts.interest = v)
				)}</label
			>
			<label
				>Fees Account {@render select(
					t.accounts.fees,
					leaves(['expense']),
					(v) => (t.accounts.fees = v)
				)}</label
			>
		</div>
	{/if}
	<label class="block">Note <textarea class={field} rows="2" bind:value={t.note}></textarea></label>
	<p class="text-xs text-gray-500">
		Existing Transactions are not changed. Edit rows one at a time on the plan page.
	</p>
	{#if error}<p class="text-red-700">{error}</p>{/if}
	<div class="flex justify-end gap-2">
		<button type="button" class="px-3 py-1.5 text-gray-600" onclick={onclose}>Cancel</button>
		<button class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50" disabled={busy}
			>Save</button
		>
	</div>
</form>
