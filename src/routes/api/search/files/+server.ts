import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSharedCache } from '#lib/server/cache.js';
import { searchFiles } from '#lib/server/db/queries/files.js';
import {
	isOlympiadFilter,
	MAX_DEEP_QUERY_LENGTH,
	MIN_DEEP_QUERY_LENGTH,
	normalizeDeepQuery,
	normalizeOlympiadFilter
} from '#lib/search.js';

/**
 * Deep search: the files whose extracted text matches `q`, best first. Files,
 * not problems, because a year-level PDF often covers every problem of a year.
 *
 * Takes `q` and an optional `olympiad`, nothing else. Never add a per-user
 * parameter: this handler reads no cookie and never touches `locals.user`,
 * which is what makes the body safe in the shared cache. `olympiad` is applied
 * before the `LIMIT` (see {@link searchFiles}); if it ever moves after it,
 * remove it and filter on the client instead. See docs/search.md.
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
	return Response.json(body);
};
