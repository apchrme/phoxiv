import type { RequestHandler } from './$types';
import { asc, eq } from 'drizzle-orm';
import { problems, years } from '$lib/server/db';
import { requireOlympiadEditor } from '$lib/server/guard';
import { requireOlympiad } from '$lib/server/db/queries/olympiads';
import { formatTopicsCsvCell, parseTopics } from '$lib/utils/topics';
import { exactScore } from '$lib/progress';

/** UTF-8 byte-order mark, so Excel reads accented titles correctly. */
const BOM = String.fromCharCode(0xfeff);

/** Quotes a CSV field (doubling embedded quotes) only when needed. */
function csvField(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Exports problems as CSV for editing in a spreadsheet and re-importing via
 * `importTitles`. The format is a contract with that action; see
 * docs/data-model.md, "The `titles.csv` contract". `max_score` is snake_case
 * because the import lowercases headers.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	// Guards itself: a `+server.ts` runs no layout load.
	const { db } = requireOlympiadEditor(locals, params.olympiad);
	await requireOlympiad(db, params.olympiad);

	const rows = await db
		.select({
			year: years.year,
			number: problems.number,
			title: problems.title,
			topics: problems.topics,
			maxScore: problems.maxScore
		})
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.where(eq(years.olympiadId, params.olympiad))
		.orderBy(asc(years.year), asc(problems.id))
		.all();

	const lines = ['year,number,title,topics,max_score'];
	for (const row of rows) {
		lines.push(
			[
				String(row.year),
				csvField(row.number),
				csvField(row.title ?? ''),
				csvField(formatTopicsCsvCell(parseTopics(row.topics))),
				// `exactScore`, not `formatScore`, so the round-trip is lossless.
				row.maxScore === null ? '' : exactScore(row.maxScore)
			].join(',')
		);
	}

	const csv = BOM + lines.join('\r\n') + '\r\n';

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${params.olympiad}-titles.csv"`
		}
	});
};
