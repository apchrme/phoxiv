import {
	test as base,
	expect,
	type APIRequestContext,
	type BrowserContext,
	type Page
} from '@playwright/test';
import type { UserKey } from '../fixtures/seed-data';
import { storageStateFor } from './auth';

/*
 * The suite's `test` and `expect`. Import them from here, never from
 * `@playwright/test`, so every test gets the guards below. See docs/testing.md,
 * "Writing a spec".
 */

/**
 * Any http(s) URL whose host isn't loopback. Requests matching it are aborted, so
 * no test can reach the CDN, GitHub or a deployed phoxiv.org. A RegExp rather
 * than a function, so Playwright can match it without a round trip per request.
 */
const EXTERNAL = /^https?:\/\/(?!(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?\/)/;

type Options = {
	/** Who the default `page`, `context` and `request` are signed in as; `null` is signed out. */
	role: UserKey | null;
	/** Set for a test that expects an uncaught page error. Off by default. */
	allowPageErrors: boolean;
};

type Fixtures = {
	/**
	 * A page in a fresh context signed in as `user` (`null`: signed out). Use it for
	 * a second actor, or for a fresh browser cache after a sign-in, ban or role
	 * change: `(reg)` pages are browser-cached for four hours.
	 */
	as: (user: UserKey | null) => Promise<Page>;
	/** An API client signed in as `user`, with its own cookie jar. */
	apiAs: (user: UserKey | null) => Promise<APIRequestContext>;
	/** Every external URL a page in this test tried to load (and was refused). */
	blockedRequests: string[];
};

/**
 * Blocks external requests and collects uncaught page errors for one context.
 * Returns the error list, which the caller checks once the test is done.
 */
async function guard(context: BrowserContext, blocked: string[]): Promise<string[]> {
	await context.route(EXTERNAL, (route) => {
		blocked.push(route.request().url());
		return route.abort('blockedbyclient');
	});
	const errors: string[] = [];
	context.on('weberror', (webError) => {
		const error = webError.error();
		errors.push(error.stack ?? error.message);
	});
	return errors;
}

function expectNoPageErrors(errors: string[], allowed: boolean): void {
	if (allowed) return;
	expect(errors, 'uncaught errors in the page (set allowPageErrors if expected)').toEqual([]);
}

export const test = base.extend<Options & Fixtures>({
	role: [null, { option: true }],
	allowPageErrors: [false, { option: true }],

	// Feeds both the default `context` and the default `request`, so one
	// `test.use({ role })` signs in the page and the API client alike.
	storageState: async ({ role }, use) => {
		await use(storageStateFor(role));
	},

	// `{}`, not `_`: Playwright reads a fixture's dependencies from its first
	// parameter and rejects anything but a destructuring pattern.
	blockedRequests: async ({}, use) => {
		await use([]);
	},

	context: async ({ context, blockedRequests, allowPageErrors }, use) => {
		const errors = await guard(context, blockedRequests);
		await use(context);
		expectNoPageErrors(errors, allowPageErrors);
	},

	as: async (
		{
			browser,
			blockedRequests,
			allowPageErrors,
			baseURL,
			viewport,
			locale,
			timezoneId,
			reducedMotion,
			colorScheme,
			userAgent,
			deviceScaleFactor,
			isMobile,
			hasTouch
		},
		use
	) => {
		const made: { context: BrowserContext; errors: string[] }[] = [];
		await use(async (user) => {
			// The same options the project gives the default context.
			const context = await browser.newContext({
				baseURL,
				viewport,
				locale,
				timezoneId,
				reducedMotion,
				colorScheme,
				userAgent,
				deviceScaleFactor,
				isMobile,
				hasTouch,
				storageState: storageStateFor(user)
			});
			made.push({ context, errors: await guard(context, blockedRequests) });
			return context.newPage();
		});
		for (const { context } of made) await context.close();
		for (const { errors } of made) expectNoPageErrors(errors, allowPageErrors);
	},

	apiAs: async ({ playwright, baseURL }, use) => {
		const made: APIRequestContext[] = [];
		await use(async (user) => {
			const api = await playwright.request.newContext({
				baseURL,
				storageState: storageStateFor(user)
			});
			made.push(api);
			return api;
		});
		for (const api of made) await api.dispose();
	}
});

export { expect };
