import { count } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { olympiads, years, problemFiles, yearFiles } from '$lib/server/db/schema.js';

export const GET = async ({ locals, setHeaders }) => {
	const db = locals.db;

	const [[olympiadCount], [yearCount], [yearFileCount], [problemFileCount]] = await Promise.all([
		db.select({ value: count() }).from(olympiads),
		db.select({ value: count() }).from(years),
		db.select({ value: count() }).from(yearFiles),
		db.select({ value: count() }).from(problemFiles)
	]);

	setHeaders({
		// max-age=0: prevents local cache from being used, so purge cache in cloudflare will update everyone's cache
		// s-maxage=86400: shared cache only updates at most once a day
		// stale-while-revalidate=604800: the shared cache will serve stale data after a day of "freshness", but force revalidation in the background. This ensures that no one will have to deal with a cache miss (unless no one views the site for a week)
		'cache-control': 'max-age=0, s-maxage=86400, stale-while-revalidate=604800'
	});

	return json({
		olympiads: olympiadCount.value,
		years: yearCount.value,
		files: yearFileCount.value + problemFileCount.value
	});
};
