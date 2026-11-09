<script lang="ts">
	// Confirmation for archive / delete: shows why an action is blocked, or asks before doing it.
	import type { ActionCheck } from '#lib/domain/index.ts';

	let {
		title,
		check,
		question,
		confirmLabel,
		danger = false,
		onconfirm,
		onclose
	}: {
		title: string;
		check: ActionCheck;
		/** Shown when allowed, e.g. "Delete MariBank and 3 accounts inside? This can't be undone." */
		question: string;
		confirmLabel: string;
		danger?: boolean;
		onconfirm: () => Promise<void>;
		onclose: () => void;
	} = $props();

	let error = $state('');
	let busy = $state(false);

	async function confirm() {
		error = '';
		busy = true;
		try {
			await onconfirm();
		} catch (err) {
			error = (err as Error).message;
		} finally {
			busy = false;
		}
	}
</script>

<div class="space-y-4 text-sm">
	<h2 class="text-lg font-semibold">{title}</h2>
	{#if check.allowed}
		<p class="text-gray-700">{question}</p>
	{:else}
		<p class="rounded-lg bg-amber-50 p-3 text-amber-900">{check.reason}</p>
	{/if}
	{#if error}<p class="text-red-600">{error}</p>{/if}
	<div class="flex justify-end gap-2">
		<button type="button" onclick={onclose} class="rounded px-3 py-1.5 hover:bg-gray-100"
			>{check.allowed ? 'Cancel' : 'OK'}</button
		>
		{#if check.allowed}
			<button
				onclick={confirm}
				disabled={busy}
				class="rounded px-3 py-1.5 text-white disabled:opacity-50 {danger
					? 'bg-red-600 hover:bg-red-700'
					: 'bg-gray-900'}">{busy ? 'Working…' : confirmLabel}</button
			>
		{/if}
	</div>
</div>
