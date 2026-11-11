<script lang="ts">
	// "Perancial" with the Peso mark standing in for its P. Sized by the surrounding font size.
	import PesoMark from './PesoMark.svelte';

	let { class: cls = '' }: { class?: string } = $props();
</script>

<span class="inline-flex items-center font-semibold tracking-tight {cls}" aria-label="Perancial">
	<!-- The mark's P fills about two thirds of its box, so it runs larger than the letters and tucks in. -->
	<PesoMark size="1.55em" tilt={false} class="-mr-[0.3em] -ml-[0.27em] shrink-0" />
	<span aria-hidden="true">erancial</span>
</span>
