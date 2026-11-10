<script lang="ts">
	// Searchable Account picker: a combobox whose popup lists Accounts with their path and
	// Balance, filtered by Account Type and sorted. Search, filter and sort live in the domain.
	import {
		ACCOUNT_TYPE_GUIDE,
		formatAmount,
		pickAccounts,
		PICKER_SORTS,
		type AccountType,
		type PickerItem,
		type PickerSort
	} from '#lib/domain/index.ts';
	import { tick } from 'svelte';

	let {
		value = $bindable(''),
		items,
		placeholder = 'Choose Account…',
		label = 'Account',
		emptyLabel,
		note,
		showBalance = true,
		disabled = false,
		onchange,
		class: klass = ''
	}: {
		value?: string;
		items: PickerItem[];
		placeholder?: string;
		/** Accessible name of the field. */
		label?: string;
		/** When set, a first row with this label picks "" (e.g. "All Accounts"). */
		emptyLabel?: string;
		/** Extra text on a row, in place of the Balance. */
		note?: (id: string) => string | undefined;
		showBalance?: boolean;
		disabled?: boolean;
		onchange?: (id: string) => void;
		class?: string;
	} = $props();

	const picked = $derived(items.find((i) => i.id === value));
	const typeLabel = (t: AccountType) => ACCOUNT_TYPE_GUIDE.find((g) => g.type === t)?.label ?? t;
	const types = $derived(ACCOUNT_TYPE_GUIDE.filter((g) => items.some((i) => i.type === g.type)));

	let open = $state(false);
	let query = $state('');
	let type = $state<AccountType | 'all'>('all');
	let sort = $state<PickerSort>('path');
	let active = $state(0);
	let trigger: HTMLButtonElement | undefined = $state();
	let popup: HTMLDivElement | undefined = $state();
	let search: HTMLInputElement | undefined = $state();
	let listEl: HTMLUListElement | undefined = $state();
	let pos = $state({ top: 0, left: 0, width: 0, maxHeight: 0 });

	type Row = { id: string; item?: PickerItem; header?: string };
	const rows = $derived.by<Row[]>(() => {
		const shown = pickAccounts(items, { query, type, sort });
		const out: Row[] = [];
		if (emptyLabel !== undefined && !query) out.push({ id: '' });
		let last: AccountType | null = null;
		for (const item of shown) {
			if (sort === 'path' && type === 'all' && types.length > 1 && item.type !== last)
				out.push({ id: `#${item.type}`, header: typeLabel(item.type) });
			last = item.type;
			out.push({ id: item.id, item });
		}
		return out;
	});
	const choices = $derived(rows.filter((r) => !r.header));

	function place() {
		if (!trigger) return;
		const r = trigger.getBoundingClientRect();
		const width = Math.min(Math.max(r.width, 380), window.innerWidth - 16);
		const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
		const below = window.innerHeight - r.bottom - 12;
		const above = r.top - 12;
		const up = below < 280 && above > below;
		const maxHeight = Math.min(440, up ? above : below);
		pos = { top: up ? r.top - 4 - maxHeight : r.bottom + 4, left, width, maxHeight };
	}

	async function show(initial = '') {
		if (disabled || open) return;
		query = initial;
		const i = choices.findIndex((c) => c.id === value);
		active = Math.max(0, i);
		place();
		open = true;
		await tick();
		search?.focus();
		scrollActive();
	}
	function close(refocus = true) {
		open = false;
		query = '';
		if (refocus) trigger?.focus();
	}
	function pick(id: string) {
		value = id;
		onchange?.(id);
		close();
	}
	async function scrollActive() {
		await tick();
		listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	}

	function triggerKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			show();
		} else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
			e.preventDefault();
			show(e.key);
		}
	}
	function searchKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const n = choices.length;
			if (n) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
			scrollActive();
		} else if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey && query)) {
			const c = choices[active];
			if (c) {
				e.preventDefault();
				pick(c.id);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
		}
	}
	$effect(() => {
		// A new search or filter starts from the top.
		void query;
		void type;
		void sort;
		active = 0;
	});

	function outside(e: PointerEvent) {
		const t = e.target as Node;
		if (open && !popup?.contains(t) && !trigger?.contains(t)) close(false);
	}
	function scrolled(e: Event) {
		if (open && !popup?.contains(e.target as Node)) place();
	}
	const uid = $props.id();
</script>

<svelte:window onpointerdown={outside} onresize={place} onscrollcapture={scrolled} />

<button
	bind:this={trigger}
	type="button"
	role="combobox"
	aria-label={label}
	aria-expanded={open}
	aria-controls="{uid}-list"
	aria-haspopup="listbox"
	{disabled}
	title={picked?.label}
	class="flex min-w-0 items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-left text-sm disabled:opacity-50 {klass}"
	onclick={() => (open ? close() : show())}
	onkeydown={triggerKey}
>
	<span class="min-w-0 flex-1 truncate {picked || (emptyLabel && !value) ? '' : 'text-gray-400'}">
		{#if picked}
			{#if picked.path}<span class="text-gray-500">{picked.path} › </span>{/if}{picked.name}
		{:else if emptyLabel !== undefined && !value}{emptyLabel}{:else}{placeholder}{/if}
	</span>
	<span class="text-gray-400" aria-hidden="true">▾</span>
</button>

{#if open}
	<div
		bind:this={popup}
		class="fixed z-[60] flex flex-col rounded-lg border bg-white text-sm shadow-2xl"
		style:top="{pos.top}px"
		style:left="{pos.left}px"
		style:width="{pos.width}px"
		style:max-height="{pos.maxHeight}px"
	>
		<div class="space-y-2 border-b p-2">
			<input
				bind:this={search}
				bind:value={query}
				onkeydown={searchKey}
				placeholder="Search Accounts…"
				aria-label="Search Accounts"
				aria-controls="{uid}-list"
				aria-activedescendant={choices[active] ? `${uid}-${choices[active].id}` : undefined}
				class="w-full rounded border-gray-300 py-1 text-sm"
			/>
			<div class="flex flex-wrap items-center gap-1 text-xs">
				{#if types.length > 1}
					{#each [{ type: 'all' as const, label: 'All' }, ...types] as t (t.type)}
						<button
							type="button"
							class="rounded-full border px-2 py-0.5 {type === t.type
								? 'border-gray-900 bg-gray-900 text-white'
								: 'text-gray-600 hover:bg-gray-100'}"
							onclick={() => (type = t.type)}>{t.label}</button
						>
					{/each}
				{/if}
				<label class="ml-auto flex items-center gap-1 text-gray-500"
					>Sort
					<select bind:value={sort} class="rounded border-gray-300 py-0 pr-7 pl-1 text-xs">
						{#each PICKER_SORTS as s (s.key)}<option value={s.key}>{s.label}</option>{/each}
					</select>
				</label>
			</div>
		</div>
		<ul bind:this={listEl} id="{uid}-list" role="listbox" class="flex-1 overflow-y-auto py-1">
			{#each rows as row (row.id)}
				{#if row.header}
					<li
						role="presentation"
						class="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 uppercase"
					>
						{row.header}
					</li>
				{:else}
					{@const i = choices.indexOf(row)}
					{@const extra = row.item && note?.(row.id)}
					<li
						id="{uid}-{row.id}"
						role="option"
						aria-selected={row.id === value}
						data-active={i === active}
						class="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 {i === active
							? 'bg-sky-50'
							: ''} {row.id === value ? 'font-medium' : ''}"
						onpointerenter={() => (active = i)}
						onpointerdown={(e) => {
							e.preventDefault();
							pick(row.id);
						}}
					>
						{#if row.item}
							<span class="min-w-0 flex-1">
								<span class="block truncate"
									>{row.item.name}{#if row.item.group}<span class="ml-1 text-xs text-gray-400"
											>Group</span
										>{/if}</span
								>
								{#if row.item.path}<span class="block truncate text-xs text-gray-500"
										>{row.item.path}</span
									>{/if}
							</span>
							{#if sort !== 'path' || type !== 'all'}<span class="text-xs text-gray-400"
									>{typeLabel(row.item.type)}</span
								>{/if}
							{#if extra}<span class="text-xs text-gray-500 tabular-nums">{extra}</span
								>{:else if showBalance}<span
									class="text-xs tabular-nums {row.item.balance < 0
										? 'text-red-600'
										: 'text-gray-600'}">{formatAmount(row.item.balance)}</span
								>{/if}
							{#if row.id === value}<span class="text-sky-700" aria-hidden="true">✓</span>{/if}
						{:else}
							<span class="flex-1 text-gray-600">{emptyLabel}</span>
						{/if}
					</li>
				{/if}
			{:else}
				<li class="px-3 py-3 text-gray-500">No Account matches.</li>
			{/each}
		</ul>
	</div>
{/if}
