import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { mdsvex } from 'mdsvex';
import { join } from 'path';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { defineConfig } from 'vite';

const lib = join(dirname(fileURLToPath(import.meta.url)), './src/lib');

export default defineConfig({
	plugins: [
		tailwindcss(),
		enhancedImages(),
		sveltekit({
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
			extensions: ['.svelte', '.svx'],
			adapter: adapter()
		})
	]
});
