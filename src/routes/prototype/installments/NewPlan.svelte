<script lang="ts">
	// PROTOTYPE: one rough create form shared by all variants. Live preview of the generated rows.
	import { flat, peso, shortDate, track, TODAY, type Plan } from './proto.ts';

	let { onSave, onClose }: { onSave: (p: Plan) => void; onClose: () => void } = $props();

	let kind = $state<'lender' | 'internal'>('lender');
	let title = $state('ANV15 VISA');
	let tags = $state('anv15-rcbc-visa');
	let purchaseDate = $state('2026-08-24');
	let entry = $state<'flat' | 'varied'>('flat');
	let amount = $state('28000');
	let rows = $state(12);
	let firstDate = $state('2026-09-15');
	let rule = $state<'monthly' | 'cutoff' | 'weekly'>('monthly');
	let interest = $state('0');
	let rowZero = $state(false);
	let trackedFrom = $state(1);
	let accountMode = $state<'auto' | 'pick' | 'create'>('auto');
	let parent = $state('Liabilities › RCBC VISA');
	let historyName = $state('Card spending');
	let inCardBalance = $state<'no' | 'yes'>('yes');
	let paying = $state('Liabilities › RCBC VISA › Card spending');
	let repaidAsset = $state('Assets › Personal Loan money');

	const day = $derived(+firstDate.slice(8, 10));
	const preview = $derived.by(() => {
		const base = flat(Math.round(+amount * 100), rows, firstDate, day, Math.round(+interest * 100));
		return rowZero
			? [{ n: 0, date: '(one period before)', principal: 0, interest: 0, additionals: [] }, ...base]
			: base;
	});
	const pastRows = $derived(
		preview.filter((r) => r.date < TODAY && r.date !== '(one period before)')
	);
	const trackedPrincipal = $derived(
		preview.filter((r) => r.n >= trackedFrom).reduce((s, r) => s + r.principal, 0)
	);
	const parentHoldsMoney = $derived(parent.includes('RCBC'));

	function save() {
		const plan: Plan = {
			id: crypto.randomUUID(),
			kind,
			title,
			tags: tags.split(/\s+/).filter(Boolean),
			purchaseDate,
			entry,
			repaidAccount: kind === 'internal' ? repaidAsset : `${parent} › ${title}`,
			payingAccount: paying,
			rows: track(
				preview.filter((r) => r.n > 0),
				trackedFrom,
				0
			)
		};
		onSave(plan);
		alert(
			kind === 'internal'
				? 'PROTOTYPE: offers the prefilled card payment (repaid Asset → card), optional.'
				: pastRows.length && inCardBalance === 'yes'
					? `PROTOTYPE: offers "move debt" prefill: ${plan.repaidAccount} → ${parent} › ${historyName}, ${peso(trackedPrincipal)}.`
					: pastRows.length
						? `PROTOTYPE: Liability Opening Balance prefilled ${peso(trackedPrincipal)}; no take-on.`
						: 'PROTOTYPE: offers the take-on Transaction (new purchase, or debt moved from the card).'
		);
	}
	const field = 'mt-1 w-full rounded border px-2 py-1';
</script>

<div class="fixed inset-0 z-40 bg-black/30" onclick={onClose} role="presentation"></div>
<div
	class="fixed top-8 left-1/2 z-40 grid max-h-[calc(100vh-4rem)] w-[64rem] max-w-full -translate-x-1/2 grid-cols-2 gap-6 overflow-y-auto rounded-xl bg-white p-6 text-sm shadow-2xl"
>
	<div class="space-y-3">
		<h2 class="text-lg font-semibold">New Installment Plan</h2>
		<div class="flex gap-2">
			{#each [['lender', 'Owed to a lender'], ['internal', 'Internal (repays my Asset)']] as const as [k, l] (k)}
				<button
					class="flex-1 rounded border px-2 py-1 {kind === k
						? 'border-gray-900 bg-gray-900 text-white'
						: ''}"
					onclick={() => (kind = k)}>{l}</button
				>
			{/each}
		</div>
		<label class="block">Title <input class={field} bind:value={title} /></label>
		<label class="block">Tags <input class={field} bind:value={tags} /></label>
		<div class="grid grid-cols-2 gap-2">
			<label>Purchase date <input type="date" class={field} bind:value={purchaseDate} /></label>
			<label>First payment <input type="date" class={field} bind:value={firstDate} /></label>
			<label
				>Repeats
				<select class={field} bind:value={rule}>
					<option value="monthly">Monthly on day {day}</option>
					<option value="cutoff">Every cut-off</option>
					<option value="weekly">Every N weeks</option>
				</select>
			</label>
			<label>Rows <input type="number" class={field} bind:value={rows} min="1" /></label>
		</div>
		<div class="flex gap-4">
			<label><input type="radio" bind:group={entry} value="flat" /> Flat</label>
			<label><input type="radio" bind:group={entry} value="varied" /> Varied (type each row)</label>
		</div>
		{#if entry === 'flat'}
			<div class="grid grid-cols-2 gap-2">
				<label>Amount (principal) <input class={field} bind:value={amount} /></label>
				<label>Interest per row <input class={field} bind:value={interest} /></label>
			</div>
		{/if}
		<label
			><input type="checkbox" bind:checked={rowZero} /> Starts with an interest/fee-only row 0</label
		>

		{#if pastRows.length}
			<div class="rounded-lg bg-amber-50 p-3">
				<label class="block"
					>First payment is in the past. Track from row
					<input
						type="number"
						class="ml-1 w-16 rounded border px-1"
						bind:value={trackedFrom}
						min="0"
					/>
				</label>
				<div class="text-xs text-amber-800">
					Rows before it are Before tracking. Tracked principal: {peso(trackedPrincipal)}
				</div>
			</div>
		{/if}

		<fieldset class="rounded-lg border p-3">
			{#if kind === 'lender'}
				<legend class="px-1 text-xs text-gray-500 uppercase">Liability</legend>
				<div class="mb-2 flex gap-3">
					<label><input type="radio" bind:group={accountMode} value="auto" /> Auto-create</label>
					<label><input type="radio" bind:group={accountMode} value="create" /> Create</label>
					<label><input type="radio" bind:group={accountMode} value="pick" /> Pick existing</label>
				</div>
				{#if accountMode === 'pick'}
					<select class={field}><option>Liabilities › RCBC VISA › ANV15 VISA (free)</option></select
					>
				{:else}
					<label class="block">Under <input class={field} bind:value={parent} /></label>
					<div class="mt-1 text-xs text-gray-500">New Leaf: {parent} › {title}</div>
					{#if parentHoldsMoney}
						<label class="mt-2 block text-xs"
							>{parent} holds card spending; keep that history as
							<input class="ml-1 rounded border px-1" bind:value={historyName} />
						</label>
					{/if}
				{/if}
				{#if pastRows.length}
					<div class="mt-2 text-xs">
						Already in the card's Opening Balance?
						<label class="ml-2"
							><input type="radio" bind:group={inCardBalance} value="yes" /> Yes</label
						>
						<label class="ml-2"
							><input type="radio" bind:group={inCardBalance} value="no" /> No</label
						>
					</div>
				{/if}
				<div class="mt-2 grid grid-cols-2 gap-2 text-xs">
					<label
						>Interest Account <select class={field}
							><option>Expenses › Finance charges</option></select
						></label
					>
					<label
						>Fees Account <select class={field}><option>Expenses › Finance charges</option></select
						></label
					>
				</div>
			{:else}
				<legend class="px-1 text-xs text-gray-500 uppercase">Repaid Asset</legend>
				<input class={field} bind:value={repaidAsset} />
			{/if}
			<label class="mt-2 block">Paid from <input class={field} bind:value={paying} /></label>
		</fieldset>

		<div class="flex justify-end gap-2">
			<button class="px-3 py-1.5 text-gray-600" onclick={onClose}>Cancel</button>
			<button class="rounded bg-gray-900 px-3 py-1.5 text-white" onclick={save}>Save plan</button>
		</div>
	</div>

	<div>
		<h3 class="mb-2 text-xs font-semibold text-gray-500 uppercase">
			Preview ({preview.length} rows)
		</h3>
		<table class="w-full text-xs">
			<tbody>
				{#each preview as r (r.n)}
					<tr class="border-b {r.n < trackedFrom && pastRows.length ? 'text-gray-400' : ''}">
						<td class="py-1 font-mono">{r.n}</td>
						<td>{r.date.startsWith('(') ? r.date : shortDate(r.date)}</td>
						<td class="text-right tabular-nums">
							{#if entry === 'varied'}<input
									class="w-20 rounded border px-1 text-right"
									value={(r.principal / 100).toFixed(2)}
								/>{:else}{peso(r.principal)}{/if}
						</td>
						<td class="text-right tabular-nums">
							{#if entry === 'varied'}<input
									class="w-16 rounded border px-1 text-right"
									value={(r.interest / 100).toFixed(2)}
								/>{:else}{r.interest ? peso(r.interest) : ''}{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
