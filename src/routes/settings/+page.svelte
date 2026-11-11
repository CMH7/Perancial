<script lang="ts">
	// Settings, one tab per area. Forecast: the owner's Inflow and Outflow Section lists. Tags.
	// Appearance: light, dark, or the system's. Account: who is signed in, and Sign out.
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		forecastSections,
		newSectionId,
		planSaveForecastSections,
		sectionErrors,
		type SectionLists
	} from '#lib/domain/index.ts';
	import TagsSettings from '#lib/components/TagsSettings.svelte';
	import { signOut } from '#lib/firebase/auth.ts';
	import { theme, type ThemeChoice } from '#lib/theme.svelte.ts';
	import { ledger } from '#lib/ledger.svelte.ts';

	const TABS = [
		['forecast', 'Forecast'],
		['tags', 'Tags'],
		['appearance', 'Appearance'],
		['account', 'Account']
	] as const;
	const tab = $derived(page.url.searchParams.get('tab') ?? 'forecast');
	const THEMES: [ThemeChoice, string, string][] = [
		['light', 'Light', 'Warm paper with charcoal ink.'],
		['dark', 'Dark', 'Charcoal paper with light ink.'],
		['system', 'System', 'Follow this device’s setting.']
	];
	function show(key: string) {
		const url = new URL(page.url.href);
		url.searchParams.set('tab', key);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same route, query only
		goto(url, { replaceState: true });
	}

	type ListKey = keyof SectionLists;
	const LISTS: { key: ListKey; title: string; hint: string }[] = [
		{
			key: 'outflowSections',
			title: 'Outflow Sections',
			hint: 'Each paid Liability (a card, a person you owe) gets its own Section automatically.'
		},
		{ key: 'inflowSections', title: 'Inflow Sections', hint: 'Group the money coming in.' }
	];

	const saved = $derived(forecastSections(ledger.forecastSettings));
	let lists = $state<SectionLists | null>(null);
	/** The form, started from what is saved (re-taken after a save or discard). */
	const form = $derived(lists ?? structuredClone($state.snapshot(saved)));
	const dirty = $derived(lists !== null && JSON.stringify(lists) !== JSON.stringify(saved));
	const errors = $derived(new Map(sectionErrors(form).map((e) => [e.at, e.message])));
	let busy = $state(false);
	let saveError = $state('');

	/** Plans naming each Section, so deleting one says what falls back. */
	const usage = $derived.by(() => {
		const count: Record<string, number> = {};
		for (const p of [...ledger.scheduled, ...ledger.installments])
			if (p.section) count[p.section] = (count[p.section] ?? 0) + 1;
		return count;
	});

	function edit(change: (l: SectionLists) => void) {
		const next = lists ?? structuredClone($state.snapshot(saved));
		change(next);
		lists = next;
	}
	const add = (key: ListKey) =>
		edit((l) => {
			const taken = [...l.inflowSections, ...l.outflowSections].map((s) => s.id);
			l[key].push({ id: newSectionId('New Section', taken), name: '' });
		});
	const move = (key: ListKey, i: number, step: number) =>
		edit((l) => {
			const [s] = l[key].splice(i, 1);
			l[key].splice(i + step, 0, s);
		});
	const remove = (key: ListKey, i: number) => edit((l) => void l[key].splice(i, 1));
	const rename = (key: ListKey, i: number, name: string) => edit((l) => (l[key][i].name = name));

	async function save() {
		saveError = '';
		busy = true;
		try {
			await ledger.commit(planSaveForecastSections(form, new Date()));
			lists = null;
		} catch (err) {
			saveError = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<main class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="mb-4 text-2xl font-semibold">Settings</h1>

	<div class="mb-6 flex gap-1 border-b text-sm">
		{#each TABS as [key, label] (key)}
			<button
				class="-mb-px border-b-2 px-3 py-2 {tab === key
					? 'border-gray-900 font-medium'
					: 'border-transparent text-gray-500 hover:text-gray-900'}"
				onclick={() => show(key)}>{label}</button
			>
		{/each}
	</div>

	{#if tab === 'appearance'}
		<fieldset class="grid max-w-2xl gap-3 sm:grid-cols-3">
			<legend class="mb-3 text-sm text-gray-600">Theme</legend>
			{#each THEMES as [key, label, hint] (key)}
				<label
					class="cursor-pointer rounded-xl border bg-white p-4 text-sm {theme.choice === key
						? 'border-gray-900 ring-1 ring-gray-900'
						: 'hover:border-gray-400'}"
				>
					<input type="radio" class="sr-only" value={key} bind:group={theme.choice} />
					<span class="font-semibold">{label}</span>
					<span class="mt-1 block text-xs text-gray-500">{hint}</span>
				</label>
			{/each}
		</fieldset>
	{:else if tab === 'account'}
		<section class="max-w-md rounded-xl border bg-white p-4 text-sm">
			<h2 class="font-semibold">Signed in</h2>
			<p class="mt-1 text-gray-600">{page.data.user?.email ?? 'Unknown account'}</p>
			<button
				onclick={signOut}
				class="mt-4 rounded border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50"
				>Sign out</button
			>
		</section>
	{:else if ledger.error}
		<p class="rounded-lg bg-red-50 p-4 text-sm text-red-800">{ledger.error}</p>
	{:else if !ledger.ready}
		<p class="text-sm text-gray-500">Loading your settings…</p>
	{:else if tab === 'tags'}
		<TagsSettings />
	{:else}
		<p class="mb-4 max-w-2xl text-sm text-gray-600">
			Sections group a Forecast's Inflows and Outflows. Pick one on a Scheduled Transaction or
			Installment Plan; a plan without one gets a default from its Accounts. Renaming keeps its
			plans; deleting sends them back to their default.
		</p>
		<div class="grid gap-6 md:grid-cols-2">
			{#each LISTS as { key, title, hint } (key)}
				<section class="rounded-xl border bg-white p-4">
					<h2 class="font-semibold">{title}</h2>
					<p class="mb-3 text-xs text-gray-500">{hint}</p>
					<ol class="space-y-2">
						{#each form[key] as s, i (s.id)}
							{@const used = usage[s.id] ?? 0}
							<li class="flex items-start gap-2">
								<span class="w-5 pt-1.5 text-right text-xs text-gray-400">{i + 1}</span>
								<div class="flex-1">
									<input
										class="w-full rounded border-gray-300 py-1 text-sm"
										value={s.name}
										placeholder="Section name"
										maxlength="60"
										aria-label="Section name"
										oninput={(e) => rename(key, i, e.currentTarget.value)}
									/>
									{#if errors.get(`${key}.${i}.name`)}<span class="text-xs text-red-600"
											>{errors.get(`${key}.${i}.name`)}</span
										>{:else if used}<span class="text-xs text-gray-500"
											>{used} {used === 1 ? 'plan' : 'plans'}</span
										>{/if}
								</div>
								<button
									class="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
									disabled={i === 0}
									aria-label="Move up"
									onclick={() => move(key, i, -1)}>↑</button
								>
								<button
									class="rounded px-1.5 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
									disabled={i === form[key].length - 1}
									aria-label="Move down"
									onclick={() => move(key, i, 1)}>↓</button
								>
								<button
									class="rounded px-1.5 py-1 text-gray-500 hover:bg-red-50 hover:text-red-700"
									aria-label="Delete {s.name}"
									title={used
										? `${used} ${used === 1 ? 'plan goes' : 'plans go'} back to their default`
										: 'Delete'}
									onclick={() => remove(key, i)}>✕</button
								>
							</li>
						{/each}
					</ol>
					<button class="mt-3 text-sm underline" onclick={() => add(key)}>+ Add Section</button>
				</section>
			{/each}
		</div>

		<div class="mt-6 flex items-center gap-3 text-sm">
			<button
				class="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40"
				disabled={!dirty || busy || errors.size > 0}
				onclick={save}>{busy ? 'Saving…' : 'Save Sections'}</button
			>
			{#if dirty}<button class="underline" onclick={() => (lists = null)}>Discard changes</button
				>{/if}
			{#if saveError}<span class="text-red-600">{saveError}</span>{/if}
			{#if !ledger.forecastSettings && !dirty}<span class="text-gray-500"
					>Showing the starting Sections.</span
				>{/if}
		</div>
	{/if}
</main>
