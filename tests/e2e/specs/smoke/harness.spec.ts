import { CDN_BASE_URL } from '../../../../src/lib/constants';
import { SENTINEL_OLYMPIAD, USERS } from '../../fixtures/seed-data';
import { SESSION_COOKIE } from '../../support/auth';
import { expect, test } from '../../support/test';

/*
 * The `setup` project: every other project depends on these, so if the harness
 * itself is broken nothing else runs. See docs/testing.md.
 */

/** Printed when the canary fails, because the cause is never in the app. */
const CANARY_HINT = `The server refused a forged session cookie for USERS.admin, so no signed-in spec can pass. Check, in order:
  1. Cookie name: SESSION_COOKIE is "${SESSION_COOKIE}". A "__Secure-" name means the Worker saw an https BETTER_AUTH_URL, i.e. .env.test's value didn't override wrangler.jsonc's vars.
  2. Secret: BETTER_AUTH_SECRET in .env.test must be the one the Worker loaded. Run "bun run test:e2e:server" and look for "Using secrets defined in .env.test"; a Playwright run hides that line.
  3. Seed: if "the sentinel olympiad exists" fails too, prepare.ts seeded a database the server doesn't read (PROXY_PERSIST in support/env.ts).
  4. Signing: support/auth.ts mirrors better-call's signCookieValue; compare it after a better-auth upgrade.`;

test.describe('the harness', { tag: '@smoke' }, () => {
	test('the canary: a forged admin cookie is a real session', async ({ apiAs, as }) => {
		const api = await apiAs('admin');

		const session = await (await api.get('/api/auth/get-session')).json();
		expect(session?.user?.id, CANARY_HINT).toBe(USERS.admin.id);

		const response = await api.get('/profile', { maxRedirects: 0 });
		expect(response.status(), CANARY_HINT).toBe(200);

		// And through a browser, which is how every UI spec signs in.
		const page = await as('admin');
		await page.goto('/profile');
		await expect(page.getByRole('heading', { name: USERS.admin.name }), CANARY_HINT).toBeVisible();
	});

	test('a signed-out visitor is sent from /profile to /login', async ({ request }) => {
		const response = await request.get('/profile', { maxRedirects: 0 });
		expect(response.status()).toBe(303);
		expect(response.headers().location).toBe('/login');
	});

	test('the sentinel olympiad exists, so this is the seeded server', async ({ request }) => {
		// If this fails, the server under test isn't the one prepare.ts seeded: an
		// E2E_REUSE server from elsewhere, or another process on the e2e port.
		const response = await request.get(`/api/olympiads/${SENTINEL_OLYMPIAD}`);
		expect(response.status()).toBe(200);
	});

	test('no request leaves loopback', async ({ page, blockedRequests }) => {
		// Both pages fetch /api/olympiads after hydration and only then render the
		// olympiad icons, which are what could load something external (a flag
		// emoji's icon comes from flagcdn.com). Wait for the fetch, then a frame,
		// so every icon has been requested before the list is read.
		for (const path of ['/', '/olympiads']) {
			const fetched = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/olympiads');
			await page.goto(path);
			await fetched;
			await page.evaluate(() => new Promise((done) => requestAnimationFrame(done)));
		}
		await expect(page.getByText('Alpha Physics Olympiad')).toBeVisible();
		// The seed's emoji icons load nothing external. If this fails, find what
		// reached out.
		expect(blockedRequests).toEqual([]);

		const outcome = await page.evaluate(
			(url) =>
				fetch(url).then(
					() => 'reached',
					() => 'blocked'
				),
			`${CDN_BASE_URL}/olympiads/alpha/2019/problems.pdf`
		);
		expect(outcome).toBe('blocked');
		expect(blockedRequests).toEqual([`${CDN_BASE_URL}/olympiads/alpha/2019/problems.pdf`]);
	});
});
