import type { RequestHandler } from './$types';
import { setSharedCache } from '#lib/server/cache.js';
import { getTeam } from '#lib/server/db/queries/contributors.js';

/** `TeamMember[]` for the `/team` page, fetched by the browser from the shared cache. */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);
	return Response.json(await getTeam(locals.db));
};
