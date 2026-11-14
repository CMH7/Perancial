<script lang="ts">
	// One Leaf Account drawn as a card, for the Funding Accounts wallet and the new-card preview.
	// Monochrome on purpose: Assets are matte graphite, Liabilities brushed titanium. The colours
	// are fixed (not theme tokens) so a card reads the same on light and dark paper.
	import PesoMark from './PesoMark.svelte';
	import { formatAmount, type AccountType } from '#lib/domain/index.ts';

	let {
		name,
		path,
		type,
		balance,
		selected = false,
		compact = false,
		peek = false,
		tag
	}: {
		name: string;
		/** The Groups above it ("" at the top level). */
		path: string;
		type: AccountType;
		balance: number;
		selected?: boolean;
		compact?: boolean;
		/** Name, Group and Balance on the top edge, for a card tucked in a pocket. */
		peek?: boolean;
		/** Small caps in the bottom corner; defaults to Debit or Credit. */
		tag?: string;
	} = $props();

	const credit = $derived(type === 'liability');
	const group = $derived(path || (credit ? 'Liabilities' : 'Assets'));
	const skin = $derived(
		credit
			? 'color:#1d1d1b;background:linear-gradient(155deg,#f4f2ee 0%,#dedbd4 55%,#cfccc4 100%);box-shadow:inset 0 0 0 1px rgb(0 0 0 / 0.07), inset 0 1px 0 rgb(255 255 255 / 0.7)'
			: 'color:#f3f1ec;background:linear-gradient(155deg,#34332f 0%,#232321 55%,#191918 100%);box-shadow:inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 1px 0 rgb(255 255 255 / 0.08)'
	);
</script>

{#snippet amount(cls: string)}
	<span class="shrink-0 font-medium tabular-nums {cls}"
		>{#if credit && balance}<span class="mr-1 text-[10px] font-normal opacity-55">owe</span
			>{/if}{formatAmount(Math.abs(balance))}</span
	>
{/snippet}
{#snippet check()}
	<span
		class="grid size-5 shrink-0 place-items-center rounded-full text-[11px]"
		style="background:#10b981;color:#fff"
		aria-hidden="true">✓</span
	>
{/snippet}

<div
	class="relative aspect-[1.586/1] w-full overflow-hidden rounded-xl select-none {compact
		? 'p-3'
		: 'p-4'} {selected ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white' : ''}"
	style={skin}
>
	<!-- A faint diagonal sheen; the only ornament. -->
	<div
		class="pointer-events-none absolute inset-0"
		style="background:linear-gradient(115deg, transparent 40%, rgb(255 255 255 / {credit
			? 0.35
			: 0.05}) 50%, transparent 60%)"
	></div>
	<div class="relative flex h-full flex-col justify-between">
		{#if peek}
			<div class="min-w-0">
				<div class="truncate text-sm leading-tight font-medium">{name}</div>
				<div class="mt-0.5 flex items-baseline justify-between gap-2">
					<span class="truncate text-[10px] tracking-wide opacity-55">{group}</span>
					{@render amount('text-[13px]')}
				</div>
			</div>
		{:else}
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<div class="truncate leading-tight font-medium {compact ? 'text-sm' : 'text-[15px]'}">
						{name}
					</div>
					<div class="mt-0.5 truncate text-[10px] tracking-wide opacity-55">{group}</div>
				</div>
				{#if selected}{@render check()}{:else}<PesoMark
						size={compact ? 14 : 18}
						class="shrink-0 opacity-40"
					/>{/if}
			</div>
		{/if}
		<div class="flex items-end justify-between gap-2">
			<span class="text-[9px] font-medium tracking-[0.18em] uppercase opacity-45"
				>{tag ?? (credit ? 'Credit' : 'Debit')}</span
			>
			{#if !peek}{@render amount(
					compact ? 'text-sm' : 'text-base'
				)}{:else if selected}{@render check()}{:else}<PesoMark
					size={14}
					class="shrink-0 opacity-40"
				/>{/if}
		</div>
	</div>
</div>
