import { and, eq } from 'drizzle-orm';
import { problemProgress, problems, years, type DB } from '../index';
import { progressKey, type GlobalProgressMap, type ProgressMap } from '$lib/progress';

/*
 * Reads and writes for `problem_progress`, one user's completed problems.
 *
 * Per-user data must never be served from `/api/*` (Cloudflare's shared cache).
 * The reads below back `GET /olympiads/[olympiad]/progress` and `GET /progress`,
 * which are outside `/api/` and send `no-store`.
 */

/**
 * The user's tracked problems in one olympiad. Only tracked problems have a key;
 * an absent key means untracked. The query seeks on `user_id`, so it reads the
 * user's rows across all olympiads, then filters.
 *
 * Don't reimplement this on top of `getAllProgress`: that returns every
 * olympiad's rows to answer about one.
 */
export async function getOlympiadProgress(
	db: DB,
	olympiadId: string,
	userId: string
): Promise<ProgressMap> {
	const rows = await db
		.select({ year: years.year, number: problems.number, score: problemProgress.score })
		.from(problemProgress)
		// Inner joins, so a flat select is fine (nesting only matters for LEFT JOIN).
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
 * Every problem the user has tracked, keyed by olympiad. Backs `GET /progress`,
 * which the search dialog's status filter fetches once per session.
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
 * Resolves `(olympiad, year, number)` to a problem id, so the client never needs
 * `problems.id`. Also returns the stored `maxScore`: validate submitted scores
 * against that, never against a value from the client.
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

/** Marks a problem completed, with `score` or `null` for "no score". */
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

/** Un-marks a problem by deleting its row. */
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
