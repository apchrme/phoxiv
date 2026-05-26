import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';
import { join } from 'path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [
		vitePreprocess(),
		mdsvex({
			extensions: ['.svx'],
			smartypants: true,
			layout: join(__dirname, './src/lib/prose.svelte')
		})
	],
	kit: {
		adapter: adapter()
	},
	extensions: ['.svelte', '.svx'],
	compilerOptions: {
		experimental: {
			async: true
		}
	}
};

export default config;
