// Light, dark, or following the system. The choice is kept on this browser; app.html applies it
// before the first paint so there is no flash, and this keeps it applied as it or the system changes.

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'perancial.theme';

function stored(): ThemeChoice {
	try {
		const v = localStorage.getItem(KEY);
		return v === 'light' || v === 'dark' ? v : 'system';
	} catch {
		return 'system';
	}
}

class Theme {
	choice = $state<ThemeChoice>(stored());

	constructor() {
		const media = window.matchMedia('(prefers-color-scheme: dark)');
		const apply = () =>
			document.documentElement.classList.toggle(
				'dark',
				this.choice === 'dark' || (this.choice === 'system' && media.matches)
			);
		media.addEventListener('change', apply);
		$effect.root(() => {
			$effect(() => {
				apply();
				try {
					localStorage.setItem(KEY, this.choice);
				} catch {
					// Private windows can refuse storage; the choice just isn't remembered.
				}
			});
		});
	}
}

export const theme = new Theme();
