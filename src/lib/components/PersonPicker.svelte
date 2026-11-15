<script lang="ts">
	// Picks the Persons on one side of a Transaction or plan: chips plus a name box that matches
	// a Person (or Me) or creates one. Persons a linked Account suggested carry a link mark.
	import { ME, personLabel, planSavePerson } from '#lib/domain/index.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	let {
		value = $bindable([]),
		linked = [],
		label,
		onremove,
		allowMe = true,
		max = Infinity
	}: {
		value?: string[];
		/** Persons the linked Accounts suggest; their chips show where they came from. */
		linked?: string[];
		label: string;
		/** Called when the owner removes a Person (so a link doesn't add it back). */
		onremove?: (id: string) => void;
		/** False where Me makes no sense, such as an Account's link. */
		allowMe?: boolean;
		/** How many Persons the side takes; the name box hides once full. */
		max?: number;
	} = $props();
	const me = $derived(allowMe ? [{ id: ME, name: 'Me' }] : []);

	let text = $state('');
	let error = $state('');
	const listId = `persons-${Math.random().toString(36).slice(2, 8)}`;

	const choices = $derived(
		[
			...me,
			...ledger.persons
				.filter((p) => !p.archived)
				.toSorted((a, b) => a.name.localeCompare(b.name))
				.map((p) => ({ id: p.id, name: p.name }))
		].filter((c) => !value.includes(c.id))
	);

	async function add() {
		const name = text.trim();
		if (!name) return;
		error = '';
		const found = [...me, ...ledger.persons.map((p) => ({ id: p.id, name: p.name }))].find(
			(c) => c.name.toLowerCase() === name.toLowerCase()
		);
		if (!allowMe && name.toLowerCase() === 'me') {
			error = 'Me cannot be linked here';
			return;
		}
		if (found) {
			if (!value.includes(found.id)) value = [...value, found.id];
			text = '';
			return;
		}
		try {
			const id = ledger.newPersonId();
			await ledger.commit(planSavePerson(ledger.persons, { id, name }, { now: new Date() }));
			value = [...value, id];
			text = '';
		} catch (err) {
			error = (err as Error).message;
		}
	}

	function remove(id: string) {
		value = value.filter((x) => x !== id);
		onremove?.(id);
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<span class="text-xs text-gray-500">{label}</span>
	{#each value as id (id)}
		<span
			class="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800"
			title={linked.includes(id) ? 'Added from a linked Account' : undefined}
			>{#if linked.includes(id)}<span aria-label="from a linked Account">🔗</span>{/if}{personLabel(
				ledger.persons,
				id
			)}<button
				type="button"
				class="text-violet-400 hover:text-red-600"
				aria-label="Remove {personLabel(ledger.persons, id)}"
				onclick={() => remove(id)}>✕</button
			></span
		>
	{/each}
	{#if value.length < max}<input
			bind:value={text}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					add();
				}
			}}
			onblur={add}
			list={listId}
			placeholder="Add person"
			aria-label="{label} person"
			class="w-32 rounded border-gray-300 py-1 text-sm"
		/>{/if}
	<datalist id={listId}>
		{#each choices as c (c.id)}<option value={c.name}></option>{/each}
	</datalist>
	{#if error}<span class="w-full text-xs text-red-600">{error}</span>{/if}
</div>
