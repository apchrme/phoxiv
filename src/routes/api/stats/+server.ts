import { count } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { olympiads, years, problemFiles, yearFiles } from '$lib/server/db';
import { setSharedCache } from '$lib/server/cache';

/** The three counters on the landing page. */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);

	const [[olympiadCount], [yearCount], [yearFileCount], [problemFileCount]] = await Promise.all([
		locals.db.select({ value: count() }).from(olympiads),
		locals.db.select({ value: count() }).from(years),
		locals.db.select({ value: count() }).from(yearFiles),
		locals.db.select({ value: count() }).from(problemFiles)
	]);

	return json({
		olympiads: olympiadCount.value,
		years: yearCount.value,
		// One user-facing "files" number; the two tables are an internal split.
		files: yearFileCount.value + problemFileCount.value
	});
};
