import type { RequestHandler } from './$types';
import { setSharedCache } from '#lib/server/cache.js';
import { requireOlympiad } from '#lib/server/db/queries/olympiads.js';
import { getOlympiadYearEntries } from '#lib/server/db/queries/content.js';

/** `YearEntry[]` for one olympiad, fetched by the olympiad page from the shared cache. */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	// Raise the 404 before setting the cache header, or the 404 is cached for a
	// day and a newly created olympiad keeps 404ing.
	await requireOlympiad(locals.db, params.olympiad);
	setSharedCache(setHeaders);
	return Response.json(await getOlympiadYearEntries(locals.db, params.olympiad));
};
