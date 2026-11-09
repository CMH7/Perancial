import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Client-only SPA: every route falls back to 200.html (see src/routes/+layout.ts, ssr = false).
			adapter: adapter({ fallback: '200.html' })
		})
	],
	test: {
		projects: [
			{
				extends: true,
				test: { name: 'unit', include: ['src/**/*.test.ts'], environment: 'node' }
			},
			{
				// Run through `bun run test:rules`, which starts the Firestore emulator first.
				extends: true,
				test: { name: 'rules', include: ['tests/rules/**/*.test.ts'], environment: 'node' }
			}
		]
	}
});
