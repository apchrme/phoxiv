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
		// Vendored or generated code, where lint findings in upstream's formatting
		// are noise: `ui/` came from the shadcn-svelte CLI and has been customised
		// by hand ever since (never re-run the CLI over it — CLAUDE.md rule 2), and
		// worker-configuration.d.ts comes from `bun run cf-typegen`. Note `ui/` is
		// excluded from prettier too, so an edit there is checked by nothing.
		//
		// `static/vendor/**` is the pdf.js build the year editor dynamic-imports by
		// URL. It is minified upstream output copied verbatim (see the README beside
		// it), so linting it reports thousands of findings about Mozilla's code and
		// hides ours. Prettier already skips all of `/static/`.
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
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',

			// `_`-prefixed bindings are intentional discards. The main use is declaring
			// an extra reactive dependency inside `$effect`, where a bare `foo;`
			// statement would trip no-unused-expressions instead.
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
