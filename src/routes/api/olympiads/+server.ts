import type { RequestHandler } from './$types';
import { setSharedCache } from '#lib/server/cache.js';
import { listOlympiads, toOlympiadEntry } from '#lib/server/db/queries/olympiads.js';

/** `OlympiadEntry[]` for the olympiads index page. */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);
	const rows = await listOlympiads(locals.db);
	return Response.json(rows.map(toOlympiadEntry));
};
