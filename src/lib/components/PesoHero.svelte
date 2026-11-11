<script lang="ts">
	// The login page's hero: the Peso mark flat and huge, bleeding off the left edge and fading out
	// to the right, so the sign-in card sits on clear paper; it also fades out at the top and toward
	// the bottom, clear of the wordmark and the headline. Drawn in the theme's ink. Purely decorative.
	//
	// The fades are paper-coloured gradients laid over the mark (with the paper's grain), not CSS
	// masks: a mask this large rasterises with a hard edge in some browsers.
	import PesoMark from './PesoMark.svelte';

	const paper = 'var(--color-gray-100)';
	const clear = 'color-mix(in oklab, var(--color-gray-100) 0%, transparent)';
</script>

<div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
	<div
		class="absolute top-[46%] -left-[14%] aspect-square w-[min(150vh,95vw)] -translate-y-1/2 text-gray-900"
	>
		<PesoMark size="100%" />
	</div>
	<!-- Left to right: the mark shows at the left and is gone by the card. -->
	<div
		class="absolute inset-0"
		style="background-image: linear-gradient(to right, {clear} 10%, {paper} 60%), var(--grain)"
	></div>
	<!-- Top and bottom: clear of the wordmark and of the headline. -->
	<div
		class="absolute inset-0"
		style="background-image: linear-gradient(to bottom, {paper} 6%, {clear} 22%, {clear} 50%, {paper} 80%)"
	></div>
</div>
