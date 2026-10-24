import { PRIVATE_CACHE_CONTROL, SHARED_CACHE_CONTROL } from '../../../../src/lib/server/cache';
import type { UserKey } from '../../fixtures/seed-data';
import { PHRASES } from '../../fixtures/seed-data';
import { SESSION_COOKIE } from '../../support/auth';
import { expect, test } from '../../support/test';

/*
 * Every route's cache policy, as docs/architecture.md ("Caching and the route
 * tree") and the route-group comments in CLAUDE.md describe it. Driven from the
 * constants in `#lib/server/cache.ts`, so a deliberate change to a policy needs
 * no edit here; a route moving to the wrong policy fails.
 *
 * Owns USERS.stale: its first page request uses up the session refresh.
 */

const PER_USER = 'private, no-store';

type Row = {
	path: string;
	as: UserKey | null;
	status: number;
	/** The exact `cache-control`, or `null` for none at all. */
	cacheControl: string | null;
};

const ROWS: Row[] = [
	// `(reg)` pages and the landing page: the visitor's browser only, four hours.
	{ path: '/', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/olympiads', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/olympiads/alpha', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/blog', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/blog/welcome', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/resources', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/privacy', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/team', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/login', as: null, status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/profile', as: 'user', status: 200, cacheControl: PRIVATE_CACHE_CONTROL },
	{ path: '/olympiads/alpha', as: 'user', status: 200, cacheControl: PRIVATE_CACHE_CONTROL },

	// Per-user progress: never stored anywhere, including the 401.
	{ path: '/progress', as: null, status: 401, cacheControl: PER_USER },
	{ path: '/progress', as: 'user', status: 200, cacheControl: PER_USER },
	{ path: '/olympiads/alpha/progress', as: null, status: 401, cacheControl: PER_USER },
	{ path: '/olympiads/alpha/progress', as: 'user', status: 200, cacheControl: PER_USER },

	// Admin and contribute set no header, so nothing caches them.
	{ path: '/admin', as: 'admin', status: 200, cacheControl: null },
	{ path: '/admin/index-stats', as: 'admin', status: 200, cacheControl: null },
	{ path: '/admin/activity', as: 'admin', status: 200, cacheControl: null },
	{ path: '/admin/reindex', as: 'admin', status: 200, cacheControl: null },
	{ path: '/contribute', as: 'contributor', status: 200, cacheControl: null },
	{ path: '/contribute/e2e-assigned', as: 'contributor', status: 200, cacheControl: null },
	{ path: '/contribute/e2e-assigned/2018', as: 'contributor', status: 200, cacheControl: null },
	{
		path: '/contribute/e2e-assigned/titles.csv',
		as: 'contributor',
		status: 200,
		cacheControl: null
	},

	// The public API: Cloudflare's shared cache for a day.
	{ path: '/api/olympiads', as: null, status: 200, cacheControl: SHARED_CACHE_CONTROL },
	{ path: '/api/olympiads/alpha', as: null, status: 200, cacheControl: SHARED_CACHE_CONTROL },
	{
		path: '/api/olympiads/alpha/contributors',
		as: null,
		status: 200,
		cacheControl: SHARED_CACHE_CONTROL
	},
	{ path: '/api/search', as: null, status: 200, cacheControl: SHARED_CACHE_CONTROL },
	{ path: '/api/stats', as: null, status: 200, cacheControl: SHARED_CACHE_CONTROL },
	{ path: '/api/team', as: null, status: 200, cacheControl: SHARED_CACHE_CONTROL },
	{
		path: `/api/search/files?q=${encodeURIComponent(PHRASES.alphaPaper)}`,
		as: null,
		status: 200,
		cacheControl: SHARED_CACHE_CONTROL
	}
];

test.describe('cache headers', { tag: '@smoke' }, () => {
	for (const row of ROWS) {
		test(`${row.path} as ${row.as ?? 'anonymous'}: ${row.cacheControl ?? 'no header'}`, async ({
			apiAs
		}) => {
			const api = await apiAs(row.as);
			const response = await api.get(row.path, { maxRedirects: 0 });
			expect(response.status()).toBe(row.status);
			expect(response.headers()['cache-control'] ?? null).toBe(row.cacheControl);
		});
	}

	test('an unknown olympiad 404s from the API without a shared-cache header', async ({
		request
	}) => {
		// `requireOlympiad` runs before `setSharedCache`; otherwise a new olympiad
		// would keep 404ing for a day (api/olympiads/[olympiad]/+server.ts).
		for (const path of ['/api/olympiads/nope', '/api/olympiads/nope/contributors']) {
			const response = await request.get(path);
			expect(response.status(), path).toBe(404);
			expect(response.headers()['cache-control'] ?? '', path).not.toContain('s-maxage');
		}
	});

	test('a repeated shared-cached /api/* request is a cache hit', async ({ request }) => {
		// The header rows above kept passing while nothing was cached:
		// adapter-cloudflare v8 dropped the `caches.default` wrapper, and the
		// `sharedCache` hook in hooks.server.ts replaces it. A miss on the second
		// request means every `/api/*` visit reads D1 again.
		const shared = ROWS.filter((row) => row.cacheControl === SHARED_CACHE_CONTROL);
		for (const { path } of shared) {
			await request.get(path);
			const response = await request.get(path);
			expect(response.status(), path).toBe(200);
			expect(response.headers()['cf-cache-status'], path).toBe('HIT');
		}

		// The two that must never be stored: a 404 (no `setSharedCache`) and auth.
		for (const path of ['/api/olympiads/nope', '/api/auth/get-session']) {
			await request.get(path);
			const response = await request.get(path);
			expect(response.headers()['cf-cache-status'], path).toBeUndefined();
		}
	});

	test('/api/auth/* is never shared-cached', async ({ apiAs }) => {
		// It carries Set-Cookie and session state (docs/auth.md).
		const api = await apiAs('user');
		const response = await api.get('/api/auth/get-session');
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control'] ?? '').not.toContain('s-maxage');
	});

	test('no /api/* response sets a cookie, even for a session due a refresh', async ({ apiAs }) => {
		// hooks.server.ts skips the session lookup on `/api/*`, so a refresh can't
		// put Set-Cookie on a shared-cached body. USERS.stale's refresh is due, so a
		// lookup here would show up as a cookie. `/api/auth/*` is the documented
		// exception and is left out.
		//
		// `no-cache` makes the `sharedCache` hook skip `caches.default`: these URLs
		// were cached by earlier tests, and a cache hit never reaches the session
		// lookup.
		const api = await apiAs('stale');
		for (const path of ['/api/olympiads', '/api/olympiads/alpha', '/api/search', '/api/stats']) {
			const response = await api.get(path, { headers: { 'cache-control': 'no-cache' } });
			expect(response.status(), path).toBe(200);
			expect(response.headers()['cf-cache-status'], `${path} came from the cache`).toBeUndefined();
			const cookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
			expect(cookies, path).toEqual([]);
		}
	});

	test('a page request re-issues the cookie when the session is refreshed', async ({ apiAs }) => {
		// Guards the "forwarded" rule in hooks.server.ts: "Dropping it let every
		// cookie die seven days after sign-in, however active the user was."
		const api = await apiAs('stale');
		const refreshed = await api.get('/olympiads');
		expect(refreshed.status()).toBe(200);
		const cookies = refreshed
			.headersArray()
			.filter((h) => h.name.toLowerCase() === 'set-cookie')
			.map((h) => h.value);
		expect(cookies).toEqual([expect.stringMatching(`^${SESSION_COOKIE}=.+; Max-Age=604800;`)]);

		// The refresh happens once; the next request has nothing to forward.
		const after = await api.get('/olympiads');
		expect(after.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie')).toEqual([]);
	});
});
