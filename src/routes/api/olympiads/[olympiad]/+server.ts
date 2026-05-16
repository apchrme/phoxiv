import { error } from '@sveltejs/kit';
import type { YearEntry } from '$lib/types.js';
import { eq, desc, asc } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { olympiads, years, yearFiles, problems, problemFiles } from '$lib/server/db/schema.js';

export const GET = async ({ params, locals, setHeaders }) => {
	setHeaders({
		// max-age=0: prevents local cache from being used, so purge cache in cloudflare will update everyone's cache
		// s-maxage=86400: shared cache only updates at most once a day
		// stale-while-revalidate=604800: the shared cache will serve stale data after a day of "freshness", but force revalidation in the background. This ensures that no one will have to deal with a cache miss (unless no one views the site for a week)
		'cache-control': 'max-age=0, s-maxage=86400, stale-while-revalidate=604800'
	});

	const db = locals.db;

	const olympiadRow = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();

	if (!olympiadRow) error(404, { message: 'Not found' });

	const [yearRows, problemRows] = await Promise.all([
		db
			.select()
			.from(years)
			.leftJoin(yearFiles, eq(yearFiles.yearId, years.id))
			.where(eq(years.olympiadId, params.olympiad))
			.orderBy(desc(years.year), asc(yearFiles.id))
			.all(),
		db
			.select()
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			.innerJoin(years, eq(years.id, problems.yearId))
			.where(eq(years.olympiadId, params.olympiad))
			.orderBy(problems.id, asc(problemFiles.id))
			.all()
	]);

	// Merge year file rows into a map keyed by year id
	const yearMap = new Map<
		number,
		{
			year: number;
			notes: string;
			extraLinks: string;
			yearFiles: { label: string; url: string }[];
		}
	>();

	for (const row of yearRows) {
		const y = row.years;
		if (!yearMap.has(y.id)) {
			yearMap.set(y.id, {
				year: y.year,
				notes: y.notes,
				extraLinks: y.extraLinks,
				yearFiles: []
			});
		}
		if (row.year_files) {
			yearMap.get(y.id)!.yearFiles.push({ label: row.year_files.label, url: row.year_files.url });
		}
	}

	// Merge problem file rows into a map keyed by problem id
	const problemMap = new Map<
		number,
		{
			yearId: number;
			number: string;
			title: string | null;
			files: { label: string; url: string }[];
		}
	>();

	for (const row of problemRows) {
		const p = row.problems;
		if (!problemMap.has(p.id)) {
			problemMap.set(p.id, {
				yearId: p.yearId,
				number: p.number,
				title: p.title,
				files: []
			});
		}
		if (row.problem_files) {
			problemMap
				.get(p.id)!
				.files.push({ label: row.problem_files.label, url: row.problem_files.url });
		}
	}

	// Group problems by year id
	const problemsByYear = new Map<number, YearEntry['problems']>();
	for (const p of problemMap.values()) {
		const list = problemsByYear.get(p.yearId) ?? [];
		list.push({
			number: p.number,
			...(p.title ? { title: p.title } : {}),
			files: p.files
		});
		problemsByYear.set(p.yearId, list);
	}

	// Build the final array, deduplicating years
	const seen = new Set<number>();
	const olympiadFiles: YearEntry[] = [];

	for (const row of yearRows) {
		const y = row.years;
		if (seen.has(y.id)) continue;
		seen.add(y.id);

		const entry = yearMap.get(y.id)!;
		olympiadFiles.push({
			year: entry.year,
			notes: JSON.parse(entry.notes) as string[],
			extraLinks: JSON.parse(entry.extraLinks) as YearEntry['extraLinks'],
			yearFiles: entry.yearFiles,
			problems: problemsByYear.get(y.id) ?? []
		});
	}

	return json(olympiadFiles);
};
