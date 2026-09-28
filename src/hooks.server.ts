import type { Handle } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';
import { createAuth } from '$lib/server/auth';

/**
 * Builds `locals.db`, `locals.auth` and `locals.user` / `locals.session`.
 *
 * db and auth are created per request because `platform.env` only exists inside
 * a Worker request; don't make them module-level singletons. The session is
 * looked up once here for every route. See docs/architecture.md.
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
export const handle: Handle = async ({ event, resolve }) => {
	if (!event.platform?.env.DB) throw new Error('Database unavailable');

	const db = drizzle(event.platform.env.DB);
	event.locals.db = db;

	const auth = createAuth(db, event.platform.env);
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
