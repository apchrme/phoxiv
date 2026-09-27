import { asc, desc, eq } from 'drizzle-orm';
import { olympiads, problemFiles, problems, yearFiles, years, type DB } from '../index';
import { parseTopics } from '$lib/utils/topics';
import { parseLabelledUrls, parseStringArray } from '$lib/utils/json';
import type { FileEntry, ProblemTopic, SearchItem, YearEntry } from '$lib/types';

/*
 * Reads that assemble years, problems and their files. Each uses a LEFT JOIN and
 * folds the flat rows into a tree with {@link groupJoined}, so the SQL ORDER BY
 * is what fixes the order of the nested arrays. Keep the orderings.
 */

/**
 * Folds LEFT JOIN rows into one entry per parent, keeping row order. `merge` runs
 * for every row, including the first, and must skip rows with no child (`null`).
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
 * Backs `GET /api/olympiads/[olympiad]`, which sits in Cloudflare's shared cache
 * for a day. Changing the shape needs a cache purge; see docs/deployment.md.
 * Missing `title` and `maxScore` are omitted, not `null`.
 */
export async function getOlympiadYearEntries(db: DB, olympiadId: string): Promise<YearEntry[]> {
	const [yearRows, problemRows] = await Promise.all([
		db
			// Keep the nested select. Drizzle only returns `null` for a missing LEFT
			// JOIN row when the selection is nested; flattened, `if (row.year_files)`
			// is always true and `{label: null, url: null}` entries leak into the API.
			.select({
				years: { id: years.id, year: years.year, notes: years.notes, extraLinks: years.extraLinks },
				year_files: { label: yearFiles.label, url: yearFiles.url }
			})
			.from(years)
			.leftJoin(yearFiles, eq(yearFiles.yearId, years.id))
			.where(eq(years.olympiadId, olympiadId))
			// Ordering by an unselected column is valid SQLite. Keep it (see top of file).
			.orderBy(desc(years.year), asc(yearFiles.id))
			.all(),
		db
			.select({
				problems: {
					id: problems.id,
					yearId: problems.yearId,
					number: problems.number,
					title: problems.title,
					topics: problems.topics,
					maxScore: problems.maxScore
				},
				problem_files: { label: problemFiles.label, url: problemFiles.url }
			})
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			// Joined only for the `where`.
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
			maxScore: row.problems.maxScore,
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
			// `=== null`, not truthiness: a hand-edited 0 should show up, not vanish.
			...(problem.maxScore === null ? {} : { maxScore: problem.maxScore }),
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

/** One year's files and problems for the contribute editor, with problem row ids. */
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
			// Fields listed explicitly so a new column isn't exposed by accident.
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
 * The whole problem corpus, flattened for the global fuzzy search
 * (`GET /api/search`).
 *
 * `searchText` joins olympiad id, name, year, number and title in that order;
 * reordering changes ranking. Topics are sent for the topic filter but kept out
 * of `searchText`, so typing a topic can't reveal which problems have it.
 * `maxScore` and `problems.id` are not sent.
 */
export async function getSearchIndex(db: DB): Promise<SearchItem[]> {
	const rows = await db
		// Select only what the mapper reads (a full row would copy olympiad
		// descriptions onto every row). Keep it nested: see getOlympiadYearEntries.
		.select({
			problems: {
				id: problems.id,
				number: problems.number,
				title: problems.title,
				topics: problems.topics
			},
			years: { year: years.year },
			olympiads: { id: olympiads.id, name: olympiads.name, icon: olympiads.icon },
			problem_files: { label: problemFiles.label, url: problemFiles.url }
		})
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
		.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
		// The search dialog shows this order as-is when a filter is set with no
		// query. `problems.id` must come before `problemFiles.id`, or `groupJoined`
		// would split a problem whose file rows aren't contiguous.
		.orderBy(
			asc(olympiads.displayOrder),
			asc(olympiads.id),
			desc(years.year),
			asc(problems.id),
			asc(problemFiles.id)
		)
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
				// Always an array, even when empty, so the client can read
				// `topics === undefined` as "stale cached body from before topics".
				topics: parseTopics(row.problems.topics),
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
