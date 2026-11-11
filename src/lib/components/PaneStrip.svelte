<script lang="ts">
	// A SplitPane's left pane while collapsed: the show button over short tab labels.
	import PaneToggle from './PaneToggle.svelte';

	let {
		collapsed = $bindable(true),
		label,
		tabs
	}: {
		collapsed?: boolean;
		label: string;
		tabs: ReadonlyArray<{
			key: string;
			short: string;
			title: string;
			active: boolean;
			href?: string;
			onclick?: () => void;
		}>;
	} = $props();
	const cls = (active: boolean) =>
		`-mr-px w-full border-r-2 py-2 text-center text-xs ${
			active
				? 'border-gray-900 font-semibold text-gray-900'
				: 'border-transparent text-gray-400 hover:text-gray-900'
		}`;
</script>

<nav aria-label={label} class="flex h-full flex-col items-center border-r bg-white py-3">
	<div class="mb-3"><PaneToggle bind:collapsed {label} /></div>
	{#each tabs as t (t.key)}
		{#if t.href}
			<!-- eslint-disable svelte/no-navigation-without-resolve -- callers pass resolved paths -->
			<a
				href={t.href}
				title={t.title}
				aria-current={t.active ? 'page' : undefined}
				class={cls(t.active)}>{t.short}</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{:else}
			<button onclick={t.onclick} title={t.title} aria-pressed={t.active} class={cls(t.active)}
				>{t.short}</button
			>
		{/if}
	{/each}
</nav>
