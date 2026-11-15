<script lang="ts">
	// An Account's linked Person (never Me). Without one, it shows what the nearest Group links.
	import { personLabel } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';
	import PersonPicker from './PersonPicker.svelte';

	let { value = $bindable(null), inherited }: { value?: string | null; inherited: string | null } =
		$props();
</script>

<div class="space-y-1">
	<PersonPicker
		bind:value={() => (value ? [value] : []), (next) => (value = next[0] ?? null)}
		label="Person"
		allowMe={false}
		max={1}
	/>
	<p class="text-xs text-gray-500">
		{#if value}
			Transactions on this Account suggest this Person.
		{:else if inherited}
			Inherits {personLabel(ledger.persons, inherited)} from its Group.
		{:else}
			Optional: who this Account tracks money with, such as a friend who owes you.
		{/if}
	</p>
</div>
