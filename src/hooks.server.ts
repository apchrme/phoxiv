import type { Handle } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';
import { createAuth } from '$lib/server/auth';

/**
 * Builds `locals.db`, `locals.auth` and `locals.user` / `locals.session`.
 *
 * db and auth are created per request because `platform.env` only exists inside
 * a Worker request; don't make them module-level singletons. The session is
 * looked up once here for every route. See docs/architecture.md.
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
