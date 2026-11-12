import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setNoStore } from '#lib/server/cache.js';
import { getOlympiadProgress } from '#lib/server/db/queries/progress.js';

/**
 * The signed-in user's progress in one olympiad, as a `ProgressMap`.
 *
 * Must stay outside `/api/`, whose shared cache would serve one user's data to
 * everyone. Per-user data only; max scores come with the cached API payload.
 * Fetched by the client because the `(reg)` layout's cache header can't be
 * replaced; as a `+server.ts` this runs no layout loads, so it escapes that
 * header and `+layout.ts`'s redirects.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	// Before the guard, so a 401 is uncached too.
	setNoStore(setHeaders);

	if (!locals.user) error(401, 'Not signed in');

	// No `requireOlympiad`: an unknown id just gives an empty map, saving a D1 read.
	return Response.json(await getOlympiadProgress(locals.db, params.olympiad, locals.user.id));
};
