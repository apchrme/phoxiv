import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSharedCache } from '$lib/server/cache';
import { getSearchIndex } from '$lib/server/db/queries/content';

/**
 * The whole problem corpus as `SearchItem[]`, for the ⌘K fuzzy search.
 *
 * Fetched once per session on first open and matched entirely in the browser —
 * there is no server-side query path for search.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);
	return json(await getSearchIndex(locals.db));
};
