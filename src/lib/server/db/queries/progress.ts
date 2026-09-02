import { and, eq } from 'drizzle-orm';
import { problemProgress, problems, years, type DB } from '../index';
import { progressKey, type GlobalProgressMap, type ProgressMap } from '$lib/progress';

/**
 * Reads and writes for `problem_progress` — one signed-in user's record of the
 * problems they have done.
 *
 * None of this is ever served from `/api/*`: those responses live in
 * Cloudflare's **shared** cache, and per-user data must never enter it. The two
 * reads below back `GET /olympiads/[olympiad]/progress` and `GET /progress`,
 * both of which sit outside `/api/` for exactly that reason and answer
 * `no-store`.
 */

/**
 * The problems this user has tracked in one olympiad, as a {@link ProgressMap}.
 *
 * One query, driven off `problem_progress.user_id` — the leading column of the
 * `problem_progress_user_problem_idx` unique index that already exists — so both
 * joins are rowid lookups and the read is O(problems this user tracked) rather
 * than O(problems in the olympiad).
 *
 * It used to be two parallel queries, and the reason was every problem's
 * maximum score: that had to come back whether the user had touched the problem
 * or not, which forced a scan of the whole olympiad. The maximum now travels
 * with the problem in `/api/olympiads/[olympiad]`, so nothing here needs to know
 * a problem exists until the user has tracked it.
 *
 * The map therefore holds one key per tracked problem and nothing else. An
 * absent key is the only spelling of "untracked", mirroring the table, where the
 * row's existence *is* completion.
 */
export async function getOlympiadProgress(
	db: DB,
	olympiadId: string,
	userId: string
): Promise<ProgressMap> {
	const rows = await db
		.select({ year: years.year, number: problems.number, score: problemProgress.score })
		.from(problemProgress)
		// Both joins are inner, so the flat selection form is safe here — the
		// nesting `queries/content.ts` insists on is only needed to make Drizzle
		// nullify a LEFT JOIN's group.
		.innerJoin(problems, eq(problems.id, problemProgress.problemId))
		.innerJoin(years, eq(years.id, problems.yearId))
		.where(and(eq(problemProgress.userId, userId), eq(years.olympiadId, olympiadId)))
		.all();

	const progress: ProgressMap = {};
	for (const row of rows) {
		progress[progressKey(row.year, row.number)] = { score: row.score };
	}
	return progress;
}

/**
 * Every problem this user has tracked, across every olympiad, as a
 * {@link GlobalProgressMap}.
 *
 * {@link getOlympiadProgress} minus the `eq(years.olympiadId, …)` predicate,
 * plus that column in the projection — so it is still driven off
 * `problem_progress.user_id`, the leading column of
 * `problem_progress_user_problem_idx`, and still costs O(rows this user tracked)
 * rather than O(problems in the archive).
 *
 * `getOlympiadProgress` is deliberately **not** reimplemented on top of this:
 * that would read every olympiad's rows to answer a question about one.
 *
 * Backs `GET /progress`, which the ⌘K dialog fetches once per session so its
 * status filter can span the archive. The nesting is what keeps IPhO 2019 T1 and
 * APhO 2019 T1 apart — see {@link GlobalProgressMap}.
 */
export async function getAllProgress(db: DB, userId: string): Promise<GlobalProgressMap> {
	const rows = await db
		.select({
			olympiadId: years.olympiadId,
			year: years.year,
			number: problems.number,
			score: problemProgress.score
		})
		.from(problemProgress)
		// Both joins are inner, so the flat selection form is safe here, exactly as
		// above — the nesting `queries/content.ts` insists on is only needed to make
		// Drizzle nullify a LEFT JOIN's group.
		.innerJoin(problems, eq(problems.id, problemProgress.problemId))
		.innerJoin(years, eq(years.id, problems.yearId))
		.where(eq(problemProgress.userId, userId))
		.all();

	const progress: GlobalProgressMap = {};
	for (const row of rows) {
		(progress[row.olympiadId] ??= {})[progressKey(row.year, row.number)] = { score: row.score };
	}
	return progress;
}

/**
 * Resolves `(olympiad, year, number)` to the problem row the user is tracking.
 *
 * This lookup is what lets the client stay ignorant of `problems.id`, and so
 * what lets {@link progressKey} file a problem under `(year, number)` at all.
 * `maxScore` comes back with it because a submitted score has to be validated
 * against the *stored* maximum — never against the one the browser can now read
 * out of `/api/olympiads/[olympiad]`.
 */
export async function findTrackableProblem(
	db: DB,
	olympiadId: string,
	year: number,
	number: string
): Promise<{ id: number; maxScore: number | null } | undefined> {
	return db
		.select({ id: problems.id, maxScore: problems.maxScore })
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.where(and(eq(years.olympiadId, olympiadId), eq(years.year, year), eq(problems.number, number)))
		.get();
}

/**
 * Marks a problem completed, with `score` or with `null` for "no score".
 *
 * `updatedAt` is named in the `set` although it is redundant: Drizzle builds the
 * conflict branch's SET with the same helper as `db.update`, so the column's
 * `$onUpdate` fires here too and an explicit value simply wins over it. It stays
 * because the refresh belongs where the write is, rather than implied by a
 * schema three files away.
 */
export async function setProblemProgress(
	db: DB,
	userId: string,
	problemId: number,
	score: number | null
): Promise<void> {
	await db
		.insert(problemProgress)
		.values({ userId, problemId, score })
		.onConflictDoUpdate({
			target: [problemProgress.userId, problemProgress.problemId],
			set: { score, updatedAt: new Date() }
		})
		.run();
}

/** Un-marks a problem. The row's existence *is* completion, so it goes away. */
export async function clearProblemProgress(
	db: DB,
	userId: string,
	problemId: number
): Promise<void> {
	await db
		.delete(problemProgress)
		.where(and(eq(problemProgress.userId, userId), eq(problemProgress.problemId, problemId)))
		.run();
}
