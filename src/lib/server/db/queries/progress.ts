import { and, eq } from 'drizzle-orm';
import { problemProgress, problems, years, type DB } from '../index';
import { progressKey, type ProgressMap } from '$lib/progress';

/**
 * Reads and writes for `problem_progress` — one signed-in user's record of the
 * problems they have done.
 *
 * None of this is ever served from `/api/*`: those responses live in
 * Cloudflare's **shared** cache, and per-user data must never enter it. The one
 * read below backs `GET /olympiads/[olympiad]/progress`, which sits outside
 * `/api/` for exactly that reason and answers `no-store`.
 */

/**
 * Everything the tracking UI needs for one olympiad, in one round trip.
 *
 * Two parallel queries rather than a `problems LEFT JOIN problem_progress`, the
 * same idiom {@link getOlympiadYearEntries} uses. The join would want an index
 * on `(problem_id, user_id)`; as written, the problems query is driven by
 * `years.olympiad_id` and the progress query by `problem_progress.user_id`,
 * which is the leading column of the unique index that already exists — and
 * "every row belonging to this user" is an access path worth keeping.
 *
 * Problems that have neither a maximum nor a progress row are omitted: the map
 * has nothing to say about them, and an absent key already means "no maximum,
 * untracked".
 */
export async function getOlympiadProgress(
	db: DB,
	olympiadId: string,
	userId: string
): Promise<ProgressMap> {
	const [problemRows, progressRows] = await Promise.all([
		db
			.select({
				id: problems.id,
				year: years.year,
				number: problems.number,
				maxScore: problems.maxScore
			})
			.from(problems)
			.innerJoin(years, eq(years.id, problems.yearId))
			.where(eq(years.olympiadId, olympiadId))
			.all(),
		db
			.select({ problemId: problemProgress.problemId, score: problemProgress.score })
			.from(problemProgress)
			.where(eq(problemProgress.userId, userId))
			.all()
	]);

	// Every problem this user has tracked anywhere, narrowed to this olympiad by
	// the loop below rather than by SQL — the second query deliberately does not
	// join back to `years`.
	const scoreByProblemId = new Map(progressRows.map((row) => [row.problemId, row.score]));

	const progress: ProgressMap = {};
	for (const problem of problemRows) {
		const completed = scoreByProblemId.has(problem.id);
		if (!completed && problem.maxScore === null) continue;
		progress[progressKey(problem.year, problem.number)] = {
			maxScore: problem.maxScore,
			completed,
			score: completed ? (scoreByProblemId.get(problem.id) ?? null) : null
		};
	}
	return progress;
}

/**
 * Resolves `(olympiad, year, number)` to the problem row the user is tracking.
 *
 * This lookup is what lets the client stay ignorant of `problems.id` — and so
 * what keeps `ProblemEntry`, and the cached `/api/olympiads/[olympiad]` payload
 * it belongs to, unchanged by problem tracking. `maxScore` comes back with it
 * because the score has to be validated against the *stored* maximum, never
 * against one the browser submitted.
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
 * `updatedAt` is set explicitly: Drizzle's `$onUpdate` only fires for
 * `db.update`, so an upsert that took the conflict branch would otherwise keep
 * the timestamp from when the row was first inserted.
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
