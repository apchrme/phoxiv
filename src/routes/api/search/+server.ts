import type { RequestHandler } from './$types';
import { setSharedCache } from '#lib/server/cache.js';
import { getSearchIndex } from '#lib/server/db/queries/content.js';

/**
 * The whole problem corpus as `SearchItem[]`, for the ⌘K fuzzy search. Fetched
 * once per session and matched entirely in the browser.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);
	return Response.json(await getSearchIndex(locals.db));
};
