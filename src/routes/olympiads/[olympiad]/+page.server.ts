import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { YearEntry } from '$lib/types.js';
import { eq, desc } from 'drizzle-orm';
import { olympiads, years, yearFiles, problems, problemFiles } from '$lib/server/db/schema.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const db = locals.db;

	const olympiadRow = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();

	if (!olympiadRow) error(404, { message: 'Not found' });

	const olympiad = {
		id: olympiadRow.id,
		name: olympiadRow.name,
		summary: olympiadRow.summary,
		icon: olympiadRow.icon,
		tag: olympiadRow.tag,
		descriptionHtml: olympiadRow.descriptionHtml,
		yearFileTypes: JSON.parse(olympiadRow.yearFileTypes) as Record<string, { label: string }>,
		problemFileTypes: JSON.parse(olympiadRow.problemFileTypes) as Record<string, { label: string }>
	};

	// Two queries with joins instead of IN clauses — variable count is always 1 (the olympiad id)
	const [yearRows, problemRows] = await Promise.all([
		db
			.select()
			.from(years)
			.leftJoin(yearFiles, eq(yearFiles.yearId, years.id))
			.where(eq(years.olympiadId, params.olympiad))
			.orderBy(desc(years.year))
			.all(),
		db
			.select()
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			.innerJoin(years, eq(years.id, problems.yearId))
			.where(eq(years.olympiadId, params.olympiad))
			.orderBy(problems.id)
			.all()
	]);

	// Merge year file rows into a map keyed by year id
	const yearMap = new Map<
		number,
		{
			year: number;
			notes: string;
			extraLinks: string;
			yearFiles: Record<string, string>;
		}
	>();

	for (const row of yearRows) {
		const y = row.years;
		if (!yearMap.has(y.id)) {
			yearMap.set(y.id, {
				year: y.year,
				notes: y.notes,
				extraLinks: y.extraLinks,
				yearFiles: {}
			});
		}
		if (row.year_files) {
			yearMap.get(y.id)!.yearFiles[row.year_files.fileType] = row.year_files.url;
		}
	}

	// Merge problem file rows into a map keyed by problem id
	const problemMap = new Map<
		number,
		{
			yearId: number;
			number: string;
			title: string | null;
			files: Record<string, string>;
		}
	>();

	for (const row of problemRows) {
		const p = row.problems;
		if (!problemMap.has(p.id)) {
			problemMap.set(p.id, {
				yearId: p.yearId,
				number: p.number,
				title: p.title,
				files: {}
			});
		}
		if (row.problem_files) {
			problemMap.get(p.id)!.files[row.problem_files.fileType] = row.problem_files.url;
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

	// Build the final array, deduplicating years that appear multiple times
	// due to the leftJoin expanding one year into multiple rows
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

	return { olympiad, olympiadFiles };
};
