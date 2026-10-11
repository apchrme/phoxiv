import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
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
		// The e2e suite: Playwright's recommended rules, which also allow the
		// `async ({}, use)` fixture signature Playwright requires. Fixed waits,
		// `networkidle` and `force: true` are errors (docs/testing.md, "Avoiding
		// flakes"). The one allowed wait, a bounded "nothing else happens within 1s"
		// after a loop regression, carries a disable comment citing the incident.
		...playwright.configs['flat/recommended'],
		files: ['tests/e2e/**/*.ts'],
		rules: {
			...playwright.configs['flat/recommended'].rules,
			'playwright/no-wait-for-timeout': 'error',
			'playwright/no-force-option': 'error',
			'playwright/no-networkidle': 'error',
			// Helpers that assert on the caller's behalf (support/actions.ts, and the
			// spec-local `expect*` helpers).
			'playwright/expect-expect': [
				'warn',
				{ assertFunctionNames: ['postAction'], assertFunctionPatterns: ['^expect[A-Z]'] }
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
