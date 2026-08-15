import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSharedCache } from '$lib/server/cache';
import { requireOlympiad } from '$lib/server/db/queries/olympiads';
import { getOlympiadYearEntries } from '$lib/server/db/queries/content';

/**
 * `YearEntry[]` for one olympiad — every year with its notes, links, files and
 * problems. Consumed by the olympiad page, which fetches it client-side so the
 * response comes from Cloudflare's shared cache rather than D1.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	// The 404 has to be raised BEFORE the cache header goes on. `setHeaders`
	// applies to the error response too, so caching a not-found here would pin it
	// in Cloudflare's shared cache for a day — long enough that an olympiad
	// created moments later would keep 404ing until someone purged the dashboard.
	await requireOlympiad(locals.db, params.olympiad);
	setSharedCache(setHeaders);
	return json(await getOlympiadYearEntries(locals.db, params.olympiad));
};
