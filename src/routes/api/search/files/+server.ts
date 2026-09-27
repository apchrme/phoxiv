import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSharedCache } from '$lib/server/cache';
import { searchFiles } from '$lib/server/db/queries/files';
import {
	isOlympiadFilter,
	MAX_DEEP_QUERY_LENGTH,
	MIN_DEEP_QUERY_LENGTH,
	normalizeDeepQuery,
	normalizeOlympiadFilter
} from '$lib/search';

/**
 * Deep search: the files whose extracted text matches `q`, best first.
 *
 * The results are files, not problems: a year-level PDF often holds every
 * problem of that year, so a problem-level hit could be wrong. `GET`, not
 * `POST`, so Cloudflare can cache it by query string.
 *
 * Parameters are `q` and an optional `olympiad`, nothing else:
 * - Never add per-user parameters (`status`, `mine`). This handler reads no
 *   cookie and never touches `locals.user`, which is what makes the body safe
 *   in the shared cache.
 * - `topics` is meaningless for a file that covers a whole year.
 * - `olympiad` works because every file belongs to exactly one olympiad. It is
 *   applied server-side before the `LIMIT` (see {@link searchFiles}); if it
 *   ever moves after the `LIMIT`, remove it and filter on the client instead.
 *
 * | `olympiad` | response |
 * | --- | --- |
 * | absent or empty | the unfiltered search |
 * | malformed | 400, before D1 and before the cache header |
 * | well-formed but unknown | 200 with no results, no extra lookup |
 */
export const GET: RequestHandler = async ({ url, locals, setHeaders }) => {
	const q = normalizeDeepQuery(url.searchParams.get('q') ?? '');
	const olympiad = normalizeOlympiadFilter(url.searchParams.get('olympiad'));

	// Refuse bad input before any D1 work and before the cache header, so a 400
	// is never shared-cached for a day.
	if (q.length < MIN_DEEP_QUERY_LENGTH) {
		error(400, `Type at least ${MIN_DEEP_QUERY_LENGTH} characters`);
	}
	if (q.length > MAX_DEEP_QUERY_LENGTH) error(400, 'Search query too long');
	if (olympiad !== null && !isOlympiadFilter(olympiad)) error(400, 'Invalid olympiad filter');

	const body = await searchFiles(locals.db, q, olympiad);

	// Set after the query, so a thrown FTS error (a 500) is never cached.
	setSharedCache(setHeaders);
	return json(body);
};
