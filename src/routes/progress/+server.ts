import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllProgress } from '$lib/server/db/queries/progress';

/**
 * The signed-in user's progress across all olympiads, for the ⌘K dialog.
 *
 * Must stay outside `/api/`, whose responses go in the shared cache and would
 * serve one user's data to everyone. Not at `/olympiads/progress`, which would
 * shadow an olympiad with id `progress`.
 *
 * The only input is `locals.user.id`. Never add a user id parameter.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	// Before the guard, so a 401 is uncached too.
	setHeaders({ 'cache-control': 'private, no-store' });

	if (!locals.user) error(401, 'Not signed in');

	return json(await getAllProgress(locals.db, locals.user.id));
};
