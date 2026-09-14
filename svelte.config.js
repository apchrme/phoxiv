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
			// A named layout map: mdsvex picks the entry whose key matches a folder in
			// the file's path, and falls back to `_`. Blog posts need a layout of their
			// own because mdsvex passes front matter to the layout as props — under
			// `prose.svelte` every post reprinted its title and description below the
			// header its route had already drawn. See `src/lib/post.svelte`.
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
