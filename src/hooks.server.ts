import type { Handle } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';
import { createAuth } from '$lib/server/auth';

/**
 * Builds the per-request context every load, action and endpoint relies on.
 *
 * The D1 binding and the auth instance cannot be module-level singletons: they
 * only exist inside a Worker request, via `platform.env`. Resolving the session
 * here rather than per route means one auth round-trip per request and a plain
 * `locals.user` everywhere. See `docs/architecture.md`.
 */
export const handle: Handle = async ({ event, resolve }) => {
	if (!event.platform?.env.DB) throw new Error('Database unavailable');

	const db = drizzle(event.platform.env.DB);
	event.locals.db = db;

	const auth = createAuth(db, event.platform.env);
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.auth = auth;
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	return resolve(event);
};
