import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		enhancedImages(),
		// A Vite plugin since mdsvex 1.0, so it goes before sveltekit(). Every `.svx`
		// page is wrapped in `src/lib/prose.svelte`, which gets the front matter as props.
		mdsvex({
			extensions: ['.svx'],
			smart_punctuation: true,
			templates: { default: '#lib/prose.svelte' }
		}),
		sveltekit({
			preprocess: [vitePreprocess()],
			// `.svx` stays here so SvelteKit finds `+page.svx` routes.
			extensions: ['.svelte', '.svx'],
			adapter: adapter()
		})
	]
});
