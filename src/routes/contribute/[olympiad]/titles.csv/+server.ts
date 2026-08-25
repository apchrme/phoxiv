import type { RequestHandler } from './$types';
import { asc, eq } from 'drizzle-orm';
import { problems, years } from '$lib/server/db';
import { requireOlympiadEditor } from '$lib/server/guard';
import { requireOlympiad } from '$lib/server/db/queries/olympiads';
import { formatTopicsCsvCell, parseTopics } from '$lib/utils/topics';
import { formatScore } from '$lib/progress';

/**
 * UTF-8 byte-order mark. Written as a char code rather than a literal so it
 * stays visible in the source; without it Excel misreads accented titles.
 */
const BOM = String.fromCharCode(0xfeff);

/** Quotes a CSV field (doubling embedded quotes) only when it actually needs it. */
function csvField(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Exports every problem title, topic set and maximum score as CSV, for bulk
 * editing in a spreadsheet and re-importing through the `importTitles` action.
 *
 * The format is a contract with that action, so the header row, the `;`-separated
 * topics cell, the leading BOM and the CRLF line endings must all be preserved.
 * See `docs/data-model.md`.
 *
 * `max_score` is snake_case where every other column is a single word by
 * coincidence: the import lowercases its header names, so a `maxScore` column
 * would arrive as `maxscore` and never be read.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
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
				// Through `formatScore`, the same formatter the cards use, so an
				// exported value always reads back through `parseMaxScore` unchanged.
				row.maxScore === null ? '' : formatScore(row.maxScore)
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
