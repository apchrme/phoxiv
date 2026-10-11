import { defineConfig, devices } from '@playwright/test';
import { join } from 'node:path';
import { BASE_URL, REPO_ROOT } from './env';

/*
 * The Playwright configuration. The root `playwright.config.ts` only re-exports
 * this, because `bun run check` type-checks `tests/` but not root-level `.ts`
 * files. See docs/testing.md.
 */

const CI = !!process.env.CI;

const REPORT_DIR = join(REPO_ROOT, 'playwright-report');

/** The harness spec: the canary, the sentinel and the loopback guard. */
const HARNESS = '**/smoke/harness.spec.ts';

export default defineConfig({
	// Absolute, because Playwright resolves relative paths against the root
	// playwright.config.ts that re-exports this file, not against this file.
	testDir: join(REPO_ROOT, 'tests', 'e2e', 'specs'),
	outputDir: join(REPO_ROOT, 'test-results'),

	// Specs share one database. Isolation comes from the seed's data classes, not
	// from fresh state per test, so tests in a file run in order and only a few
	// files run at once.
	fullyParallel: false,
	workers: CI ? 1 : 2,
	// Some fixtures can be used only once (a stale session's refresh, a ban). A
	// retry would run against used-up state and fail for the wrong reason, or pass
	// for one.
	retries: 0,
	forbidOnly: CI,

	reporter: CI
		? [['github'], ['list'], ['html', { open: 'never', outputFolder: REPORT_DIR }]]
		: [['list'], ['html', { open: 'never', outputFolder: REPORT_DIR }]],

	use: {
		baseURL: BASE_URL,
		reducedMotion: 'reduce',
		locale: 'en-GB',
		timezoneId: 'UTC',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},

	projects: [
		{
			// Runs first. If the canary can't sign in, or the sentinel olympiad is
			// missing, every other project is skipped instead of failing confusingly.
			name: 'setup',
			testMatch: HARNESS,
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'desktop',
			testIgnore: HARNESS,
			dependencies: ['setup'],
			use: { ...devices['Desktop Chrome'] }
		}
	],

	webServer: {
		command: 'bun tests/e2e/server.ts',
		cwd: REPO_ROOT,
		url: `${BASE_URL}/api/stats`,
		// Only with E2E_REUSE: a server left running from another session may hold
		// state from an earlier run, so it is never picked up by accident.
		reuseExistingServer: !!process.env.E2E_REUSE,
		// A cold build is about 35 s, migrations about 8 s.
		timeout: 240_000
	}
});
