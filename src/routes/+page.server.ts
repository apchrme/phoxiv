import { count } from 'drizzle-orm';
import { olympiads, years, problemFiles, yearFiles } from '$lib/server/db/schema.js';

export const load = async ({ locals }) => {
	const db = locals.db;

	const [[olympiadCount], [yearCount], [yearFileCount], [problemFileCount]] = await Promise.all([
		db.select({ value: count() }).from(olympiads),
		db.select({ value: count() }).from(years),
		db.select({ value: count() }).from(yearFiles),
		db.select({ value: count() }).from(problemFiles)
	]);

	return {
		stats: {
			olympiads: olympiadCount.value,
			years: yearCount.value,
			files: yearFileCount.value + problemFileCount.value
		}
	};
};
