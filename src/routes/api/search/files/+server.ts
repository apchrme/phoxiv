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
 * # Why the path says `files`
 *
 * Because **the results are files**, which is the one thing a caller must
 * understand — a year-level PDF routinely holds every problem of a year, so a
 * problem-level hit would claim "IPhO 2019 T2" on the strength of text belonging
 * to T1. "Deep search" is the UI's word for it and has no place in a URL. Not
 * `/api/files/search` either, which would imply a bare `/api/files` enumerating
 * the archive.
 *
 * `GET`, not `POST`: Cloudflare's cache key includes the query string and a POST
 * is uncacheable, which would turn every keystroke into a D1 read.
 *
 * # Two parameters, `q` and an optional `olympiad`
 *
 * No `limit`, no `topics`, no `status`, no `mine`, and the rule that admits one
 * and refuses the others is sharper than "every accepted parameter multiplies
 * cache keys" — true, but it would refuse `olympiad` too:
 *
 * - **`status` and `mine` are per-user and must never touch `/api/`.** The whole
 *   point of this path is that its bodies are safe in a shared cache.
 * - **`topics` is meaningless against a file**, since one year-level PDF covers
 *   every topic in that year. A future `?topics=` should look wrong on sight.
 * - **`olympiad` is not**, because a file belongs to *exactly one* olympiad even
 *   when it is year-level: `years.olympiad_id` is `NOT NULL` with a single FK, so
 *   both join paths resolve to one, and `FileSearchResult.olympiadId` has always
 *   been a scalar rather than a list.
 *
 * The filter is applied **server-side and before the `LIMIT`**, which is the only
 * thing this parameter buys and the entire reason it is not a client-side filter
 * over the body: see {@link searchFiles}. If it ever drifts to being applied
 * after the `LIMIT`, delete the parameter rather than keep it — at that point the
 * client can do the same job from a body it already has.
 *
 * # The three-way response, and why an unknown olympiad is not a 404
 *
 * | `olympiad` | response | cached | extra D1 |
 * | --- | --- | --- | --- |
 * | absent or empty | the unfiltered search | yes, today's key | none |
 * | malformed | **400**, before D1 and before the cache header | no | none |
 * | well-formed but unknown | **200 with no results** | yes | none |
 *
 * "Unknown → empty" is what the url range does naturally, so there is no
 * divergent branch to keep honest, and it avoids a `SELECT 1 FROM olympiads` on
 * the happy path of every filtered search forever to catch a state the UI cannot
 * produce. The 400 for a malformed value is the opposite trade and is about the
 * cache: a 400 is uncacheable, so a bad bookmark would otherwise be a Worker and
 * D1 hit per keystroke — {@link isOlympiadFilter} explains what the gate is and
 * is not for.
 *
 * # No purge is owed for this parameter
 *
 * It is optional, and an unfiltered request is `?q=gravitation` before and after,
 * so every body already in Cloudflare's shared cache stays a correct answer to
 * its own url; filtered urls are keys that have never existed. Two things keep
 * that true and both are deliberate: the response shape is **unchanged** — no new
 * field — and the unfiltered SQL statement is byte-identical, which is why
 * {@link searchFiles} composes its scope with `sql.empty()`. CLAUDE.md rule 9
 * does not fire here; this is a newly accepted *input* only.
 *
 * # This handler reads no cookie and never touches `locals.user`
 *
 * Unchanged by the filter. Every field of the body comes from `olympiads`,
 * `years`, the two file tables and the text index, so it is entirely public and
 * safe in the shared cache. That invariant is the reason a future `?mine=1` would
 * be a serious bug rather than a feature.
 */
export const GET: RequestHandler = async ({ url, locals, setHeaders }) => {
	const q = normalizeDeepQuery(url.searchParams.get('q') ?? '');
	const olympiad = normalizeOlympiadFilter(url.searchParams.get('olympiad'));

	// All three bounds refused before any D1 work AND before the cache header goes
	// on — the same ordering `/api/olympiads/[olympiad]` uses for its 404. A 400
	// held in the shared cache for a day would outlive the client bug that caused
	// it.
	if (q.length < MIN_DEEP_QUERY_LENGTH) {
		error(400, `Type at least ${MIN_DEEP_QUERY_LENGTH} characters`);
	}
	if (q.length > MAX_DEEP_QUERY_LENGTH) error(400, 'Search query too long');
	if (olympiad !== null && !isOlympiadFilter(olympiad)) error(400, 'Invalid olympiad filter');

	const body = await searchFiles(locals.db, q, olympiad);

	// After the query, deliberately: an FTS syntax error or a missing index table
	// throws, and a 500 must not be cached for a day. The sanitiser in
	// `queries/files.ts` is the real defence; this ordering is what keeps a
	// failure from persisting.
	setSharedCache(setHeaders);
	return json(body);
};
