import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setSharedCache } from '$lib/server/cache';
import { listOlympiads, toOlympiadEntry } from '$lib/server/db/queries/olympiads';

/** `OlympiadEntry[]` for the olympiads index page. */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);
	const rows = await listOlympiads(locals.db);
	return json(rows.map(toOlympiadEntry));
};
