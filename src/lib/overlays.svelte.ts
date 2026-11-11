// Open drawers and dialogs, in the order they opened. Esc closes the most recent one; a click
// outside the most recent drawer closes it (dialogs only close from their own buttons or Esc).
//
// Esc is skipped when something already handled it (`defaultPrevented`, or stopped, as the
// Account picker does to close its list). Page Esc handlers should do the same check, so the
// first Esc closes the overlay and only a later one reaches the page.

type Layer = {
	kind: 'drawer' | 'dialog';
	close: () => void;
	/** The drawer's element, for telling inside clicks from outside ones. */
	el?: () => HTMLElement | undefined;
};

/** A plain array: only event handlers read it, and effects that open layers must not depend on it. */
const stack: Layer[] = [];

/** Adds an overlay; returns its removal, for an `$effect` cleanup. */
export function openLayer(layer: Layer): () => void {
	stack.push(layer);
	return () => {
		const i = stack.indexOf(layer);
		if (i >= 0) stack.splice(i, 1);
	};
}

/** Whether any drawer or dialog is open (keyboard shortcuts stay off while one is). */
export const overlayOpen = () => stack.length > 0;
export const dialogOpen = () => stack.some((l) => l.kind === 'dialog');

/** True for typing targets, where single-key shortcuts must not fire. */
export function isTyping(target: EventTarget | null): boolean {
	return (
		target instanceof Element &&
		!!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
	);
}

if (typeof window !== 'undefined') {
	window.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
		const top = stack.at(-1);
		if (!top) return;
		e.preventDefault();
		top.close();
	});

	window.addEventListener(
		'pointerdown',
		(e) => {
			if (e.button !== 0) return;
			const top = stack.at(-1);
			if (top?.kind !== 'drawer') return;
			const t = e.target;
			if (!(t instanceof Element)) return;
			// Inside the drawer, inside a dialog or popup over it, or on a control that toggles it.
			if (top.el?.()?.contains(t) || t.closest('dialog[open], [data-overlay-keep]')) return;
			top.close();
		},
		{ capture: true }
	);
}
