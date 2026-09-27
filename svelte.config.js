import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mdsvex } from 'mdsvex';
import { join } from 'path';

const lib = join(dirname(fileURLToPath(import.meta.url)), './src/lib');

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [
		vitePreprocess(),
		mdsvex({
			extensions: ['.svx'],
			smartypants: true,
			// Picked by folder name in the file's path, else `_`. Posts get their own
			// layout so their title isn't printed twice; see `src/lib/post.svelte`.
			layout: {
				posts: join(lib, 'post.svelte'),
				_: join(lib, 'prose.svelte')
			}
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
