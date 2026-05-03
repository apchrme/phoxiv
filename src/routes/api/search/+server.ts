import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, asc } from 'drizzle-orm';
import { olympiads, years, problems, problemFiles } from '$lib/server/db/schema.js';
import type { SearchItem } from '$lib/types.js';

export const GET: RequestHandler = async ({ locals }) => {
	const db = locals.db;

	const rows = await db
		.select()
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
		.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
		.orderBy(asc(problemFiles.id))
		.all();

	const problemMap = new Map<number, SearchItem>();

	for (const row of rows) {
		const p = row.problems;
		const y = row.years;
		const o = row.olympiads;

		if (!problemMap.has(p.id)) {
			problemMap.set(p.id, {
				olympiadId: o.id,
				olympiadName: o.name,
				olympiadIcon: o.icon,
				year: y.year,
				searchText: [o.id, o.name, String(y.year), p.number, p.title ?? ''].join(' ').toLowerCase(),
				problem: {
					number: p.number,
					...(p.title ? { title: p.title } : {}),
					files: []
				}
			});
		}

		if (row.problem_files) {
			problemMap.get(p.id)!.problem.files.push({
				label: row.problem_files.label,
				url: row.problem_files.url
			});
		}
	}

	return json([...problemMap.values()]);
};