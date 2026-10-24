import type { Handle } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { env, waitUntil } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { createAuth } from '#lib/server/auth.js';
import { SHARED_CACHE_CONTROL } from '#lib/server/cache.js';

/**
 * Serves `/api/*` from `caches.default`, the shared cache in docs/architecture.md.
 *
 * adapter-cloudflare up to v7 did this in its worker; v8 does not, and after
 * the upgrade every `/api/*` request went to D1 until this hook replaced it. It
 * runs first, so a hit returns before `app` touches D1 or auth.
 *
 * - Only a 200 carrying {@link SHARED_CACHE_CONTROL} is stored, so an endpoint
 *   opts in by calling `setSharedCache()` and a 404 or a thrown 500 never is.
 * - `/api/auth/*` is skipped: it carries `Set-Cookie` and session state.
 * - A request with `Cache-Control: no-cache` skips the lookup but still stores
 *   the fresh response, as the adapter's worker did. The e2e specs rely on it
 *   to read past entries cached earlier in the run (docs/testing.md).
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
 * db and auth are created per request, from `env` read inside the hook; don't
 * make them module-level singletons. Outside a running server (`vite build`
 * imports this module) the adapter's `env` throws on access, so reading it at
 * module scope breaks the build. The session is looked up once here for every
 * route. See docs/architecture.md.
 *
 * Three rules about the session lookup (docs/auth.md):
 * - `/api/*` skips it. Those responses go in Cloudflare's shared cache, so none
 *   may depend on the user or carry `Set-Cookie`; with `locals.user` always null
 *   there, none can. `/api/auth/*` does its own lookup through the handler.
 * - The `Set-Cookie` BetterAuth emits when it extends a session (daily, by
 *   `updateAge`) is forwarded. Dropping it let every cookie die seven days
 *   after sign-in, however active the user was.
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
