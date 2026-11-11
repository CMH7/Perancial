<script lang="ts">
	// The Perancial mark: a bold ₱ tilted forward, drawn as one continuous line. Its two bars stop
	// short of the P's middle, and the P breaks between the bars, so the bar ends and the P's broken
	// ends join into one zigzag stroke. Plain filled shapes whose cut edges line up exactly (no masks
	// or strokes, which alias and leave notches when tilted). Filled with `currentColor`, so it takes
	// the theme's ink: charcoal on light paper, light on dark. Keep in step with assets/favicon.svg.
	let {
		size = 24,
		class: cls = '',
		label,
		fill = 'currentColor',
		tilt = true
	}: {
		size?: number | string;
		class?: string;
		label?: string;
		/** Defaults to the text colour; a `url(#…)` paints a gradient. */
		fill?: string;
		/** Leans 12° forward; upright beside type (the wordmark). */
		tilt?: boolean;
	} = $props();
</script>

<svg
	viewBox="0 0 100 100"
	width={size}
	height={size}
	class={cls}
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	<g transform={tilt ? 'rotate(12 52 51)' : undefined} {fill}>
		<!-- The P above the break: stem top, top of the bowl, and the bowl down to y 38. -->
		<path d="M30 18H54A24 24 0 0 1 77.66 38H65.31A12 12 0 0 0 54 30H42V38H30Z" />
		<!-- The P below the break: the rest of the bowl, its foot, and the stem. -->
		<path d="M30 46H42V54H54A12 12 0 0 0 65.31 46H77.66A24 24 0 0 1 54 66H42V84H30Z" />
		<!-- The bar stubs, flush with the break: outside the stem and outside the bowl only. -->
		<path d="M18 31H42V38H18Z M65.31 31H86V38H65.31Z" />
		<path d="M18 46H42V53H18Z M65.31 46H86V53H65.31Z" />
	</g>
</svg>
