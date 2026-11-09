<script lang="ts">
	import { app, usingEmulators } from '#lib/firebase/app.ts';
</script>

<main class="mx-auto max-w-3xl p-8">
	<h1 class="text-2xl font-semibold">Perancial</h1>
	<p class="mt-2 text-sm text-gray-500">
		Firebase project <code>{app.options.projectId}</code>{usingEmulators ? ' (emulators)' : ''}.
	</p>
</main>
