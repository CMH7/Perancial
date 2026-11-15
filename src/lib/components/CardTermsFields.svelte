<script lang="ts">
	// Credit Card section of the Account forms: an on/off switch plus Statement Day, Due Day and an
	// optional Pay-on day.
	let {
		enabled = $bindable(false),
		statementDay = $bindable(''),
		dueDay = $bindable(''),
		payDay = $bindable(''),
		errors = {}
	}: {
		enabled?: boolean;
		statementDay?: string;
		dueDay?: string;
		/** Optional: the day the owner plans to pay, on or before the Due Date. */
		payDay?: string;
		/** Messages keyed `card.statementDay` / `card.dueDay`. */
		errors?: Record<string, string>;
	} = $props();
</script>

<fieldset class="space-y-2 rounded-lg border border-gray-200 p-3">
	<label class="flex items-center gap-2">
		<input type="checkbox" bind:checked={enabled} class="rounded border-gray-300" />
		<span class="font-medium text-gray-800">Credit Card</span>
	</label>
	<p class="text-xs text-gray-500">
		Bills charges in monthly Statements, so the Forecast plans each payment by itself. Also fits
		pay-later services with a monthly statement.
	</p>
	{#if enabled}
		<div class="grid grid-cols-2 gap-3">
			<label class="block">
				<span class="text-gray-600">Statement Day</span>
				<input
					bind:value={statementDay}
					inputmode="numeric"
					placeholder="e.g. 20"
					class="mt-1 w-full rounded border-gray-300 text-sm tabular-nums"
				/>
				{#if errors['card.statementDay']}
					<span class="text-xs text-red-600">{errors['card.statementDay']}</span>
				{:else}
					<span class="text-xs text-gray-500">The day the statement closes.</span>
				{/if}
			</label>
			<label class="block">
				<span class="text-gray-600">Due Day</span>
				<input
					bind:value={dueDay}
					inputmode="numeric"
					placeholder="e.g. 9"
					class="mt-1 w-full rounded border-gray-300 text-sm tabular-nums"
				/>
				{#if errors['card.dueDay']}
					<span class="text-xs text-red-600">{errors['card.dueDay']}</span>
				{:else}
					<span class="text-xs text-gray-500">Pay by this day; next month if not after it.</span>
				{/if}
			</label>
			<label class="col-span-2 block">
				<span class="text-gray-600">Pay on day <span class="text-gray-400">(optional)</span></span>
				<input
					bind:value={payDay}
					inputmode="numeric"
					placeholder="e.g. 15"
					class="mt-1 w-full rounded border-gray-300 text-sm tabular-nums"
				/>
				{#if errors['card.payDay']}
					<span class="text-xs text-red-600">{errors['card.payDay']}</span>
				{:else}
					<span class="text-xs text-gray-500"
						>The day you plan to pay, on or before the Due Date. The Forecast puts each Statement in
						the Cut-off of this day; blank means the Due Date.</span
					>
				{/if}
			</label>
		</div>
	{/if}
</fieldset>
