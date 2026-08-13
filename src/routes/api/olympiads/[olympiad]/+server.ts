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
	setSharedCache(setHeaders);
	await requireOlympiad(locals.db, params.olympiad);
	return json(await getOlympiadYearEntries(locals.db, params.olympiad));
};
