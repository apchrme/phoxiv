import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq, asc } from 'drizzle-orm';
import { olympiads, years, problems } from '$lib/server/db/schema.js';
import { requireOlympiadEditor } from '$lib/server/guard';
import { formatTopicsCsvCell, parseTopics } from '$lib/utils/topics.js';

/** Quotes a CSV field (doubling embedded quotes) only when it actually needs it. */
function csvField(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	requireOlympiadEditor(locals, params.olympiad);
	const db = locals.db;

	const olympiadRow = await db
		.select({ id: olympiads.id })
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();
	if (!olympiadRow) error(404, 'Olympiad not found');

	const rows = await db
		.select({
			year: years.year,
			number: problems.number,
			title: problems.title,
			topics: problems.topics
		})
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.where(eq(years.olympiadId, params.olympiad))
		.orderBy(asc(years.year), asc(problems.id))
		.all();

	const lines = ['year,number,title,topics'];
	for (const row of rows) {
		lines.push(
			[
				String(row.year),
				csvField(row.number),
				csvField(row.title ?? ''),
				csvField(formatTopicsCsvCell(parseTopics(row.topics)))
			].join(',')
		);
	}

	// Leading BOM so Excel opens accented titles (e.g. non-English olympiad names) correctly.
	const csv = '\uFEFF' + lines.join('\r\n') + '\r\n';

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${params.olympiad}-titles.csv"`
		}
	});
};
