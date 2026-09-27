import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	{
		// Vendored or generated code: `ui/` (shadcn-svelte, hand-customised; never
		// re-run the CLI over it, and prettier skips it too, so edits there go
		// unchecked), the `cf-typegen` output, and the vendored pdf.js build.
		ignores: ['src/lib/components/ui/**', 'src/worker-configuration.d.ts', 'static/vendor/**']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },

		rules: {
			// TypeScript already checks this; typescript-eslint recommends turning it off.
			'no-undef': 'off',

			// `_`-prefixed bindings are intentional discards, e.g. to add a dependency
			// inside `$effect`.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					varsIgnorePattern: '^_',
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],

		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte', '.svx'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
