import { count } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { olympiads, years, problemFiles, yearFiles } from '#lib/server/db/index.js';
import { setSharedCache } from '#lib/server/cache.js';

/** The three counters on the landing page. */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);

	const [[olympiadCount], [yearCount], [yearFileCount], [problemFileCount]] = await Promise.all([
		locals.db.select({ value: count() }).from(olympiads),
		locals.db.select({ value: count() }).from(years),
		locals.db.select({ value: count() }).from(yearFiles),
		locals.db.select({ value: count() }).from(problemFiles)
	]);

	return Response.json({
		olympiads: olympiadCount.value,
		years: yearCount.value,
		// One user-facing "files" number; the two tables are an internal split.
		files: yearFileCount.value + problemFileCount.value
	});
};
