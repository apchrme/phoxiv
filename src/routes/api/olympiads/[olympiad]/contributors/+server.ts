import type { RequestHandler } from './$types';
import { setSharedCache } from '#lib/server/cache.js';
import { requireOlympiad } from '#lib/server/db/queries/olympiads.js';
import { getOlympiadContributors } from '#lib/server/db/queries/contributors.js';

/**
 * `Contributor[]` for one olympiad. The olympiad page fetches it only when its
 * contributors list is opened, so the page load stays one row.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	// 404 before the cache header, as in the parent endpoint.
	await requireOlympiad(locals.db, params.olympiad);
	setSharedCache(setHeaders);
	return Response.json(await getOlympiadContributors(locals.db, params.olympiad));
};
