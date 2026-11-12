import type { Handle } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { env, waitUntil } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { createAuth } from '#lib/server/auth.js';
import { SHARED_CACHE_CONTROL } from '#lib/server/cache.js';

/**
 * Serves `/api/*` from `caches.default`, the shared cache in docs/architecture.md.
 * adapter-cloudflare v8 dropped this; without it every `/api/*` request hit D1.
 * Runs first, so a hit never touches D1 or auth.
 *
 * - Only a 200 carrying {@link SHARED_CACHE_CONTROL} is stored, so an endpoint
 *   opts in with `setSharedCache()` and an error response never is.
 * - `/api/auth/*` is skipped: it carries `Set-Cookie` and session state.
 * - `Cache-Control: no-cache` skips the lookup but still stores the response;
 *   the e2e specs rely on it (docs/testing.md).
 */
const sharedCache: Handle = async ({ event, resolve }) => {
	const { request, url } = event;
	if (
		request.method !== 'GET' ||
		!url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/api/auth/')
	) {
		return resolve(event);
	}

	// The DOM lib's `CacheStorage` shadows the Workers one, which adds `default`.
	// Keep `default` rather than a named cache: it's what a dashboard purge clears.
	const cache = (caches as unknown as { default: Cache }).default;
	if (!request.headers.get('cache-control')?.includes('no-cache')) {
		const hit = await cache.match(request);
		if (hit) return hit;
	}

	const response = await resolve(event);
	if (response.status === 200 && response.headers.get('cache-control') === SHARED_CACHE_CONTROL) {
		waitUntil(cache.put(request, response.clone()));
	}
	return response;
};

/**
 * Builds `locals.db`, `locals.auth` and `locals.user` / `locals.session`.
 *
 * db and auth are built per request from `env`; don't make them module-level
 * singletons: `vite build` imports this module, and `env` throws outside a
 * running server. See docs/architecture.md.
 *
 * The session lookup (docs/auth.md):
 * - `/api/*` skips it, so no shared-cache response can depend on the user or
 *   carry `Set-Cookie`. `/api/auth/*` looks it up through the handler.
 * - The `Set-Cookie` BetterAuth emits when it extends a session is forwarded.
 *   Dropping it let every cookie die seven days after sign-in, however active
 *   the user was.
 * - A banned user is treated as signed out, whatever sessions they still hold.
 *   BetterAuth only checks `banned` when a session is created.
 */
const app: Handle = async ({ event, resolve }) => {
	if (!env.DB) throw new Error('Database unavailable');

	const db = drizzle(env.DB);
	event.locals.db = db;

	const auth = createAuth(db, env);
	event.locals.auth = auth;
	event.locals.user = null;
	event.locals.session = null;

	if (event.url.pathname.startsWith('/api/')) return resolve(event);

	const { headers: authHeaders, response: session } = await auth.api.getSession({
		headers: event.request.headers,
		returnHeaders: true
	});
	if (session && !session.user.banned) {
		event.locals.user = session.user;
		event.locals.session = session.session;
	}

	const response = await resolve(event);
	for (const cookie of authHeaders.getSetCookie()) response.headers.append('set-cookie', cookie);
	return response;
};

export const handle = sequence(sharedCache, app);
