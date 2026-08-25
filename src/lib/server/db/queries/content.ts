import { asc, desc, eq } from 'drizzle-orm';
import { olympiads, problemFiles, problems, yearFiles, years, type DB } from '../index';
import { parseTopics } from '$lib/utils/topics';
import { parseLabelledUrls, parseStringArray } from '$lib/utils/json';
import type { FileEntry, ProblemTopic, SearchItem, YearEntry } from '$lib/types';

/**
 * The joined reads that assemble years, problems and their files.
 *
 * D1 has no cheap way to fetch a nested tree, so each of these issues one
 * `LEFT JOIN` per level and folds the flat rows back into a tree in memory with
 * {@link groupJoined}. That is why the file orderings below are load-bearing:
 * the SQL `ORDER BY` is the only thing that fixes the order of the nested arrays.
 */

/**
 * Folds rows from a `LEFT JOIN` into one entry per distinct parent.
 *
 * Insertion order is preserved, so the query's `ORDER BY` carries through to the
 * result. `merge` is called for every row including the first, and is
 * responsible for skipping rows whose joined side is `null` (no child).
 *
 * @param keyOf identifies the parent a row belongs to
 * @param init builds the parent entry from its first row
 * @param merge folds one row's child into the parent entry
 */
export function groupJoined<Row, K, T>(
	rows: readonly Row[],
	keyOf: (row: Row) => K,
	init: (row: Row) => T,
	merge: (entry: T, row: Row) => void
): T[] {
	const byKey = new Map<K, T>();
	for (const row of rows) {
		const key = keyOf(row);
		let entry = byKey.get(key);
		if (entry === undefined) {
			entry = init(row);
			byKey.set(key, entry);
		}
		merge(entry, row);
	}
	return [...byKey.values()];
}

/** A problem as the contribute page needs it: with its row id, for updates. */
export type EditableProblem = {
	id: number;
	number: string;
	title: string | null;
	topics: ProblemTopic[];
	/** The denominator a tracked score is shown against; null when unset. */
	maxScore: number | null;
	files: FileEntry[];
};

/**
 * Every year of an olympiad with its notes, links, files and problems.
 *
 * Backs `GET /api/olympiads/[olympiad]`, whose response shape is frozen — it is
 * held in Cloudflare's shared cache for up to a day. In particular `title` is
 * *omitted* rather than set to `null` when a problem has none.
 */
export async function getOlympiadYearEntries(db: DB, olympiadId: string): Promise<YearEntry[]> {
	const [yearRows, problemRows] = await Promise.all([
		db
			// Nested select form, not a flat one: Drizzle only nullifies a LEFT
			// JOIN's group when the selection path is two levels deep. Flatten this
			// and `if (row.year_files)` below is permanently truthy, pushing
			// `{label: null, url: null}` entries into a frozen API payload.
			.select({
				years: { id: years.id, year: years.year, notes: years.notes, extraLinks: years.extraLinks },
				year_files: { label: yearFiles.label, url: yearFiles.url }
			})
			.from(years)
			.leftJoin(yearFiles, eq(yearFiles.yearId, years.id))
			.where(eq(years.olympiadId, olympiadId))
			// `yearFiles.id` is ordered by but no longer selected. Valid SQLite, and
			// the emitted SQL is unchanged — but the ordering is load-bearing (see
			// the file header), so it must survive any further trimming here.
			.orderBy(desc(years.year), asc(yearFiles.id))
			.all(),
		db
			.select({
				problems: {
					id: problems.id,
					yearId: problems.yearId,
					number: problems.number,
					title: problems.title,
					topics: problems.topics
				},
				problem_files: { label: problemFiles.label, url: problemFiles.url }
			})
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			// `years` is joined purely to make the `where` expressible; no column of
			// it is read, so none is selected.
			.innerJoin(years, eq(years.id, problems.yearId))
			.where(eq(years.olympiadId, olympiadId))
			.orderBy(asc(problems.id), asc(problemFiles.id))
			.all()
	]);

	const problemsByYear = new Map<number, YearEntry['problems']>();
	for (const problem of groupJoined(
		problemRows,
		(row) => row.problems.id,
		(row) => ({
			yearId: row.problems.yearId,
			number: row.problems.number,
			title: row.problems.title,
			topics: parseTopics(row.problems.topics),
			files: [] as FileEntry[]
		}),
		(entry, row) => {
			if (row.problem_files) {
				entry.files.push({ label: row.problem_files.label, url: row.problem_files.url });
			}
		}
	)) {
		const list = problemsByYear.get(problem.yearId) ?? [];
		list.push({
			number: problem.number,
			...(problem.title ? { title: problem.title } : {}),
			topics: problem.topics,
			files: problem.files
		});
		problemsByYear.set(problem.yearId, list);
	}

	return groupJoined(
		yearRows,
		(row) => row.years.id,
		(row) => ({
			year: row.years.year,
			notes: parseStringArray(row.years.notes),
			extraLinks: parseLabelledUrls(row.years.extraLinks),
			yearFiles: [] as FileEntry[],
			problems: problemsByYear.get(row.years.id) ?? []
		}),
		(entry, row) => {
			if (row.year_files) {
				entry.yearFiles.push({ label: row.year_files.label, url: row.year_files.url });
			}
		}
	);
}

/**
 * One year's files and problems, for the contribute editor.
 *
 * Cannot share {@link getOlympiadYearEntries}: the editor needs each problem's
 * row `id` to update it, and must not group by year.
 */
export async function getYearContent(
	db: DB,
	yearId: number
): Promise<{ yearFiles: FileEntry[]; problems: EditableProblem[] }> {
	const [yearFileRows, problemRows] = await Promise.all([
		db
			.select()
			.from(yearFiles)
			.where(eq(yearFiles.yearId, yearId))
			.orderBy(asc(yearFiles.id))
			.all(),
		db
			.select()
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			.where(eq(problems.yearId, yearId))
			.orderBy(asc(problems.id), asc(problemFiles.id))
			.all()
	]);

	return {
		yearFiles: yearFileRows.map((f) => ({ label: f.label, url: f.url })),
		problems: groupJoined(
			problemRows,
			(row) => row.problems.id,
			// Lists its fields explicitly even though the select above is a bare
			// `db.select()`, so a new column is only exposed to the editor on purpose.
			(row) => ({
				id: row.problems.id,
				number: row.problems.number,
				title: row.problems.title,
				topics: parseTopics(row.problems.topics),
				maxScore: row.problems.maxScore,
				files: [] as FileEntry[]
			}),
			(entry, row) => {
				if (row.problem_files) {
					entry.files.push({ label: row.problem_files.label, url: row.problem_files.url });
				}
			}
		)
	};
}

/**
 * The whole problem corpus, flattened for the global fuzzy search.
 *
 * Backs `GET /api/search`. `searchText` is a lowercased join of olympiad id,
 * olympiad name, year, problem number and title **in that order** — uFuzzy
 * matches against it directly, so reordering changes which results rank first.
 * `topics` is deliberately omitted: it would leak hints about the problem.
 */
export async function getSearchIndex(db: DB): Promise<SearchItem[]> {
	const rows = await db
		// Projected down to the nine columns the mapper reads. The full row dragged
		// `olympiads.descriptionMd`/`descriptionHtml` along — per-olympiad markdown
		// blobs, replicated onto every problem-file row of the whole corpus.
		//
		// Nested select form, not a flat one: Drizzle only nullifies a LEFT JOIN's
		// group when the selection path is two levels deep, and `if
		// (row.problem_files)` below depends on that.
		.select({
			problems: { id: problems.id, number: problems.number, title: problems.title },
			years: { year: years.year },
			olympiads: { id: olympiads.id, name: olympiads.name, icon: olympiads.icon },
			problem_files: { label: problemFiles.label, url: problemFiles.url }
		})
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
		.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
		// Ordered by a column that is no longer selected. Valid SQLite, unchanged
		// SQL — but load-bearing, so it must survive any further trimming.
		.orderBy(asc(problemFiles.id))
		.all();

	return groupJoined(
		rows,
		(row) => row.problems.id,
		(row): SearchItem => ({
			olympiadId: row.olympiads.id,
			olympiadName: row.olympiads.name,
			olympiadIcon: row.olympiads.icon,
			year: row.years.year,
			searchText: [
				row.olympiads.id,
				row.olympiads.name,
				String(row.years.year),
				row.problems.number,
				row.problems.title ?? ''
			]
				.join(' ')
				.toLowerCase(),
			problem: {
				number: row.problems.number,
				...(row.problems.title ? { title: row.problems.title } : {}),
				files: []
			}
		}),
		(entry, row) => {
			if (row.problem_files) {
				entry.problem.files.push({ label: row.problem_files.label, url: row.problem_files.url });
			}
		}
	);
}
