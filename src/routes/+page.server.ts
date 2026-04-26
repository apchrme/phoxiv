import type { PageServerLoad } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import { count } from 'drizzle-orm';
import { olympiads, years, problemFiles, yearFiles } from '$lib/server/db/schema.js';

export const load: PageServerLoad = async ({ platform }) => {
	const d1 = platform?.env.DB;
	if (!d1) return { stats: { olympiads: 0, years: 0, files: 0 } };

	const db = drizzle(d1);

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