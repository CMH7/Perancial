<script lang="ts">
	// PROTOTYPE ONLY. Variant B, "Dashboard": KPI strip across the top, a slim left rail of
	// Account Types, and the open Account as a composition bar plus cards (share of the parent).
	import { ACCOUNT_TYPE_GUIDE, clearedBalance } from '#lib/domain/index.ts';
	import AccountRegister from '#lib/components/AccountRegister.svelte';
	import Amount from '#lib/components/Amount.svelte';
	import { TYPE_TONE, type VariantProps } from './types.ts';

	let {
		chart,
		account,
		path,
		root,
		children,
		group,
		showArchived = $bindable(),
		href,
		open
	}: VariantProps = $props();

	const totals = $derived(chart.totals());
	const tone = $derived(TYPE_TONE[account.type]);
	const parts = $derived(
		children.map((c) => ({ c, v: Math.abs(chart.balance(c.id)) })).sort((a, b) => b.v - a.v)
	);
	const whole = $derived(parts.reduce((s, p) => s + p.v, 0));
	const pct = (v: number) => (whole ? Math.round((v / whole) * 100) : 0);
	const opacity = (i: number) => Math.max(0.25, 1 - i * 0.15);
</script>

<div class="min-h-[calc(100vh-var(--nav-h))] bg-slate-50 px-8 py-6">
	<!-- KPI strip -->
	<section class="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
		<div class="col-span-2 rounded-2xl bg-gray-900 p-5 text-white lg:col-span-1">
			<div class="text-xs tracking-wide text-gray-400 uppercase">Net Worth</div>
			<div class="mt-1 text-2xl"><Amount value={totals.netWorth} bold /></div>
		</div>
		{#each [{ k: 'Assets', v: totals.assets, t: 'asset' }, { k: 'Liabilities', v: totals.liabilities, t: 'liability' }, { k: 'Income', v: chart.balance('income'), t: 'income' }, { k: 'Expenses', v: chart.balance('expense'), t: 'expense' }] as const as kpi (kpi.k)}
			<a
				href={href(kpi.t)}
				class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 hover:ring-gray-300"
			>
				<div class="flex items-center gap-2 text-xs tracking-wide text-gray-500 uppercase">
					<span class="size-2 rounded-full {TYPE_TONE[kpi.t].dot}"></span>{kpi.k}
				</div>
				<div class="mt-1 text-xl"><Amount value={kpi.v} bold /></div>
			</a>
		{/each}
	</section>

	<div class="grid grid-cols-[12rem_minmax(0,1fr)] gap-6">
		<!-- Rail -->
		<nav aria-label="Account Types" class="sticky top-[calc(var(--nav-h)+1.5rem)] self-start">
			<ul class="space-y-1">
				{#each ACCOUNT_TYPE_GUIDE as g (g.type)}
					{@const active = root?.id === g.type}
					<li>
						<a
							href={href(g.type)}
							title={g.what}
							class="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm {active
								? `${TYPE_TONE[g.type].soft} ${TYPE_TONE[g.type].text} font-semibold`
								: 'text-gray-600 hover:bg-white'}"
						>
							<span
								class="grid size-7 place-items-center rounded-lg text-xs font-bold text-white {TYPE_TONE[
									g.type
								].dot}">{g.label[0]}</span
							>
							{g.label}
						</a>
					</li>
				{/each}
			</ul>
			<label class="mt-4 flex items-center gap-2 px-3 text-xs text-gray-500">
				<input type="checkbox" bind:checked={showArchived} class="rounded" /> Show archived
			</label>
		</nav>

		<main class="min-w-0 space-y-6">
			<!-- Hero -->
			<section class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
				<div class="mb-1 flex flex-wrap items-center gap-1 text-xs text-gray-500">
					{#each path as p, i (p.id)}
						{#if i > 0}<span>/</span>{/if}
						<a href={href(p.id)} class="hover:underline">{p.name}</a>
					{/each}
				</div>
				<div class="flex flex-wrap items-end justify-between gap-4">
					<div>
						<h1 class="text-2xl font-semibold">{account.name}</h1>
						<div class="mt-2 text-4xl tracking-tight">
							<Amount value={chart.balance(account.id)} bold />
						</div>
						{#if account.type === 'asset' || account.type === 'liability'}
							<div class="mt-1 text-xs text-gray-500">
								Cleared <Amount value={clearedBalance(chart, account.id)} />
							</div>
						{/if}
					</div>
					<div class="flex flex-wrap gap-2 text-sm">
						{#if account.system !== 'opening-balances'}
							<button
								onclick={() => open('create')}
								class="rounded-full bg-gray-900 px-4 py-1.5 text-white">+ Add</button
							>
							<button onclick={() => open('edit')} class="rounded-full px-3 py-1.5 ring-1 ring-gray-200"
								>Edit</button
							>
						{/if}
						{#if !account.system}
							<button onclick={() => open('move')} class="rounded-full px-3 py-1.5 ring-1 ring-gray-200"
								>Move</button
							>
							<button
								onclick={() => open('archive')}
								class="rounded-full px-3 py-1.5 ring-1 ring-gray-200"
								>{account.archived ? 'Unarchive' : 'Archive'}</button
							>
							<button
								onclick={() => open('delete')}
								class="rounded-full px-3 py-1.5 text-red-600 ring-1 ring-red-200">Delete</button
							>
						{/if}
					</div>
				</div>

				{#if whole > 0}
					<div class="mt-6 flex h-3 overflow-hidden rounded-full bg-gray-100">
						{#each parts as p, i (p.c.id)}
							<div
								class="{tone.bar} border-r border-white last:border-0"
								style="width: {(p.v / whole) * 100}%; opacity: {opacity(i)}"
								title="{p.c.name} · {pct(p.v)}%"
							></div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Children as cards -->
			{#if parts.length}
				<section class="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
					{#each parts as p, i (p.c.id)}
						<a
							href={href(p.c.id)}
							class="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition hover:-translate-y-0.5 hover:shadow-md {p
								.c.archived
								? 'opacity-50'
								: ''}"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<div class="truncate font-medium">{p.c.name}</div>
									<div class="truncate text-xs text-gray-500">
										{chart.isGroup(p.c.id)
											? `${chart.descendantCount(p.c.id)} inside`
											: p.c.description || 'Leaf Account'}
									</div>
								</div>
								<span class="rounded-full px-2 py-0.5 text-xs {tone.soft} {tone.text}"
									>{pct(p.v)}%</span
								>
							</div>
							<div class="mt-4 text-xl"><Amount value={chart.balance(p.c.id)} bold /></div>
							<div class="mt-3 h-1.5 rounded-full bg-gray-100">
								<div
									class="h-full rounded-full {tone.bar}"
									style="width: {pct(p.v)}%; opacity: {opacity(i)}"
								></div>
							</div>
						</a>
					{/each}
				</section>
			{:else if group}
				<p class="rounded-2xl bg-white p-8 text-center text-sm text-gray-500 ring-1 ring-gray-200">
					No accounts here yet.
				</p>
			{/if}

			<div class="rounded-2xl bg-white px-2 pb-2 shadow-sm ring-1 ring-gray-200 [&>section]:mt-4">
				<AccountRegister accountId={account.id} onopening={() => open('edit')} />
			</div>
		</main>
	</div>
</div>
