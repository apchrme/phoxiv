import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOlympiadProgress } from '$lib/server/db/queries/progress';

/**
 * The signed-in user's progress in one olympiad, as a `ProgressMap`.
 *
 * Must stay outside `/api/`, whose responses go in the shared cache and would
 * serve one user's data to everyone. Per-user data only; max scores come with
 * the cached API payload. Fetched by the client, not the page load, because the
 * `(reg)` layout has already set a private cache header that can't be replaced.
 * A `+server.ts` runs no layout loads, so neither that header nor `+layout.ts`'s
 * redirects apply here.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	// Before the guard, so a 401 is uncached too.
	setHeaders({ 'cache-control': 'private, no-store' });

	if (!locals.user) error(401, 'Not signed in');

	// No `requireOlympiad`: an unknown id just gives an empty map, saving a D1 read.
	return json(await getOlympiadProgress(locals.db, params.olympiad, locals.user.id));
};
