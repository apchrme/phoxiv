import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
	badgeProblems,
	badges,
	olympiads,
	problemProgress,
	problems,
	userBadges,
	years,
	type DB
} from '../index';
import { qualifies, sortByHolders, type BadgeEntry, type BadgeScope } from '#lib/badges.js';
import { parseStringArray } from '#lib/utils/json.js';
import { parseTopics, serializeTopics } from '#lib/utils/topics.js';
import type { ProblemTopic } from '#lib/types.js';

/*
 * Reads and writes for badges and who holds them.
 *
 * Read budget (the free tier's 5M rows a day is enforced, so going over is an
 * outage). Evaluating one user reads that user's progress rows and the badges,
 * never other users' rows: `evaluateUserBadges` runs on every dashboard view
 * and every tracked problem. Re-evaluating everyone scans all of
 * `problem_progress`, so only `recomputeBadge` does it, and only an admin save
 * calls that. Holder counts come from `user_badges` for the same reason.
 */

export type BadgeRow = typeof badges.$inferSelect;

/** The fields an admin edits. */
export type BadgeInput = {
	name: string;
	description: string;
	icon: string;
	color: string;
	requiredCount: number;
	scoreMinPct: number | null;
	scoreMaxPct: number | null;
	scope: BadgeScope;
	topics: ProblemTopic[];
	olympiadIds: string[];
	requirementHidden: boolean;
};

/** A problem addressed as the app addresses it, never by `problems.id`. */
export type ProblemRef = { olympiadId: string; year: number; number: string };

/** A manual badge's problem, for the admin editor. */
export type ManualProblem = ProblemRef & { olympiadName: string; title: string | null };

/** The JSON columns parsed. */
export function toBadgeEntry(row: BadgeRow): BadgeEntry {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		icon: row.icon,
		color: row.color,
		requiredCount: row.requiredCount,
		scoreMinPct: row.scoreMinPct,
		scoreMaxPct: row.scoreMaxPct,
		scope: row.scope,
		topics: parseTopics(row.topics),
		olympiadIds: parseStringArray(row.olympiadIds),
		requirementHidden: row.requirementHidden
	};
}

/** A badge with how many people hold it. */
export type ListedBadge = BadgeEntry & { holders: number };

/**
 * Every badge with its holder count, most holders first (`sortByHolders`).
 * Two cheap reads: one row per badge, and one aggregate over `user_badges`.
 * Counts only: who holds a badge is never public (docs/auth.md).
 */
export async function listBadges(db: DB): Promise<ListedBadge[]> {
	const [rows, counts] = await Promise.all([
		db.select().from(badges).all(),
		db
			.select({ badgeId: userBadges.badgeId, n: count() })
			.from(userBadges)
			.groupBy(userBadges.badgeId)
			.all()
	]);
	const holders = new Map(counts.map((r) => [r.badgeId, r.n]));
	return sortByHolders(
		rows.map((row) => ({ ...toBadgeEntry(row), holders: holders.get(row.id) ?? 0 }))
	);
}

/** One badge, or `undefined`. */
export async function getBadge(db: DB, id: number): Promise<BadgeEntry | undefined> {
	const row = await db.select().from(badges).where(eq(badges.id, id)).get();
	return row && toBadgeEntry(row);
}

// ── One user ────────────────────────────────────────────────────────────────

/** One of the user's completed problems, with what the dashboard shows. */
export type ProgressRow = {
	olympiadId: string;
	olympiadName: string;
	olympiadIcon: string;
	year: number;
	number: string;
	title: string | null;
	topics: ProblemTopic[];
	maxScore: number | null;
	score: number | null;
	updatedAt: Date;
};

/** Where the user stands on one badge. */
export type BadgeStanding = {
	badge: BadgeEntry;
	/** Qualifying completions, which can exceed `requiredCount`. */
	count: number;
	/** When the award was recorded, or `null` while not earned. */
	earnedAt: Date | null;
};

export type UserBadges = {
	/** Without `problems.id`, which never reaches the client. */
	rows: ProgressRow[];
	standings: BadgeStanding[];
	/** Badges this call awarded, for the "Badge unlocked" toast. */
	newlyEarned: BadgeEntry[];
};

/**
 * Evaluates every badge for one user and syncs their `user_badges` rows to the
 * result: inserts new awards, deletes lost ones (awards are revocable), and
 * writes nothing when nothing changed.
 *
 * Reads only the user's own rows; see the read budget above. Because every
 * call re-syncs, awards left stale by a content edit (a re-tagged problem, a
 * new max score, a deleted problem) correct themselves on the user's next
 * dashboard view or tracked problem. Two concurrent calls can each write from
 * their own snapshot; the next call corrects that too.
 */
export async function evaluateUserBadges(db: DB, userId: string): Promise<UserBadges> {
	const [progress, manualLinks, badgeRows, awards] = await db.batch([
		db
			.select({
				problemId: problemProgress.problemId,
				olympiadId: years.olympiadId,
				olympiadName: olympiads.name,
				olympiadIcon: olympiads.icon,
				year: years.year,
				number: problems.number,
				title: problems.title,
				topics: problems.topics,
				maxScore: problems.maxScore,
				score: problemProgress.score,
				updatedAt: problemProgress.updatedAt
			})
			.from(problemProgress)
			.innerJoin(problems, eq(problems.id, problemProgress.problemId))
			.innerJoin(years, eq(years.id, problems.yearId))
			.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
			.where(eq(problemProgress.userId, userId)),
		// Only the manual-badge links that touch this user's problems.
		db
			.select({ badgeId: badgeProblems.badgeId, problemId: badgeProblems.problemId })
			.from(badgeProblems)
			.innerJoin(problemProgress, eq(problemProgress.problemId, badgeProblems.problemId))
			.where(eq(problemProgress.userId, userId)),
		// Oldest first, not by holders: counting them would read every
		// `user_badges` row on every dashboard view (the read budget above).
		db.select().from(badges).orderBy(asc(badges.id)),
		db
			.select({ badgeId: userBadges.badgeId, earnedAt: userBadges.earnedAt })
			.from(userBadges)
			.where(eq(userBadges.userId, userId))
	]);

	const manual = new Map<number, Set<number>>();
	for (const link of manualLinks) {
		let set = manual.get(link.badgeId);
		if (!set) manual.set(link.badgeId, (set = new Set()));
		set.add(link.problemId);
	}

	const inputs = progress.map((row) => ({ ...row, topics: parseTopics(row.topics) }));
	const awarded = new Map(awards.map((a) => [a.badgeId, a.earnedAt]));
	const now = new Date();

	const standings: BadgeStanding[] = [];
	const newlyEarned: BadgeEntry[] = [];
	const lost: number[] = [];
	for (const row of badgeRows) {
		const badge = toBadgeEntry(row);
		const ids = manual.get(badge.id);
		let n = 0;
		for (const input of inputs) if (qualifies(badge, input, ids)) n++;

		const earned = n >= badge.requiredCount;
		let earnedAt = awarded.get(badge.id) ?? null;
		if (earned && !earnedAt) {
			earnedAt = now;
			newlyEarned.push(badge);
		} else if (!earned && earnedAt) {
			earnedAt = null;
			lost.push(badge.id);
		}
		standings.push({ badge, count: n, earnedAt });
	}

	if (newlyEarned.length > 0 || lost.length > 0) {
		// Conflicts are ignored so a concurrent call that got there first wins.
		const writes = [];
		if (newlyEarned.length > 0) {
			writes.push(
				db
					.insert(userBadges)
					.values(newlyEarned.map((b) => ({ userId, badgeId: b.id, earnedAt: now })))
					.onConflictDoNothing()
			);
		}
		if (lost.length > 0) {
			writes.push(
				db
					.delete(userBadges)
					.where(and(eq(userBadges.userId, userId), inArray(userBadges.badgeId, lost)))
			);
		}
		await db.batch(writes as [(typeof writes)[number], ...(typeof writes)[number][]]);
	}

	const rows: ProgressRow[] = inputs.map(({ problemId: _, ...rest }) => rest);
	return { rows, standings, newlyEarned };
}

// ── Every user, after an admin edit ─────────────────────────────────────────

/**
 * The SQL twin of `qualifies` in #lib/badges, over `pp` (problem_progress),
 * `p` (problems) and `y` (years). Keep the two in step; `admin/badges.spec.ts`
 * checks that they agree.
 *
 * Lists travel as one JSON parameter each and are unpacked with `json_each`,
 * which keeps any badge under D1's 100-parameter limit. Topics compare the
 * stored strings directly: `problems.topics` is always written through
 * `serializeTopics`, so they are already canonical.
 */
function qualifyingCondition(badge: BadgeEntry): SQL {
	const parts: SQL[] = [];
	if (badge.scope === 'manual') {
		parts.push(sql`EXISTS (SELECT 1 FROM badge_problems bp
			WHERE bp.badge_id = ${badge.id} AND bp.problem_id = p.id)`);
	}
	if (badge.scope === 'filter' && badge.olympiadIds.length > 0) {
		parts.push(
			sql`y.olympiad_id IN (SELECT value FROM json_each(${JSON.stringify(badge.olympiadIds)}))`
		);
	}
	if (badge.scope === 'filter' && badge.topics.length > 0) {
		parts.push(sql`EXISTS (SELECT 1 FROM json_each(p.topics) t
			WHERE t.value IN (SELECT value FROM json_each(${JSON.stringify(badge.topics)})))`);
	}
	if (badge.scoreMinPct !== null || badge.scoreMaxPct !== null) {
		parts.push(sql`pp.score IS NOT NULL AND p.max_score IS NOT NULL`);
		if (badge.scoreMinPct !== null) {
			parts.push(sql`pp.score * 100 >= ${badge.scoreMinPct} * p.max_score`);
		}
		if (badge.scoreMaxPct !== null) {
			parts.push(sql`pp.score * 100 <= ${badge.scoreMaxPct} * p.max_score`);
		}
	}
	return parts.length === 0 ? sql`1` : sql.join(parts, sql` AND `);
}

/**
 * Re-evaluates one badge for every user and syncs `user_badges` to match:
 * awards it to everyone who now qualifies and takes it from everyone who no
 * longer does. Existing holders keep their `earned_at`.
 *
 * Scans every progress row, so only an admin save calls it, and there is no
 * "recompute all" (that would be one scan per badge).
 */
export async function recomputeBadge(db: DB, badge: BadgeEntry): Promise<void> {
	const holders = sql`SELECT pp.user_id FROM problem_progress pp
		JOIN problems p ON p.id = pp.problem_id
		JOIN years y ON y.id = p.year_id
		WHERE ${qualifyingCondition(badge)}
		GROUP BY pp.user_id
		HAVING count(*) >= ${badge.requiredCount}`;
	await db.batch([
		db.run(sql`DELETE FROM user_badges
			WHERE badge_id = ${badge.id} AND user_id NOT IN (${holders})`),
		// `WHERE true` resolves SQLite's parsing ambiguity between a join's ON and
		// the upsert's ON CONFLICT.
		db.run(sql`INSERT INTO user_badges (user_id, badge_id)
			SELECT user_id, ${badge.id} FROM (${holders}) WHERE true
			ON CONFLICT (user_id, badge_id) DO NOTHING`)
	]);
}

// ── Admin editing ───────────────────────────────────────────────────────────

/** A manual badge's problems, in olympiad, year and number order. */
export async function getManualProblems(db: DB, badgeId: number): Promise<ManualProblem[]> {
	return db
		.select({
			olympiadId: years.olympiadId,
			olympiadName: olympiads.name,
			year: years.year,
			number: problems.number,
			title: problems.title
		})
		.from(badgeProblems)
		.innerJoin(problems, eq(problems.id, badgeProblems.problemId))
		.innerJoin(years, eq(years.id, problems.yearId))
		.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
		.where(eq(badgeProblems.badgeId, badgeId))
		.orderBy(asc(olympiads.displayOrder), asc(years.olympiadId), asc(years.year), asc(problems.id))
		.all();
}

/** The key a {@link ProblemRef} is matched on. */
function refKey(ref: ProblemRef): string {
	return `${ref.olympiadId}\u0000${ref.year}\u0000${ref.number}`;
}

/**
 * Resolves problem refs to ids in one query, reading only the problems of the
 * olympiads involved. `missing` lists refs that no longer exist, so the editor
 * can say which instead of saving a shorter list.
 */
export async function resolveProblemRefs(
	db: DB,
	refs: readonly ProblemRef[]
): Promise<{ ids: number[]; missing: ProblemRef[] }> {
	if (refs.length === 0) return { ids: [], missing: [] };
	const olympiadIds = [...new Set(refs.map((r) => r.olympiadId))];
	const rows = await db
		.select({
			id: problems.id,
			olympiadId: years.olympiadId,
			year: years.year,
			number: problems.number
		})
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.where(
			sql`${years.olympiadId} IN (SELECT value FROM json_each(${JSON.stringify(olympiadIds)}))`
		)
		.all();
	const byKey = new Map(rows.map((r) => [refKey(r), r.id]));
	const ids = new Set<number>();
	const missing: ProblemRef[] = [];
	for (const ref of refs) {
		const id = byKey.get(refKey(ref));
		if (id === undefined) missing.push(ref);
		else ids.add(id);
	}
	return { ids: [...ids], missing };
}

/** Column values for an insert or update. */
function toColumns(input: BadgeInput) {
	return {
		name: input.name,
		description: input.description,
		icon: input.icon,
		color: input.color,
		requiredCount: input.requiredCount,
		scoreMinPct: input.scoreMinPct,
		scoreMaxPct: input.scoreMaxPct,
		scope: input.scope,
		// Lists that don't apply to the scope are cleared, so a stale filter can't
		// come back if the scope is switched again later.
		topics: serializeTopics(input.scope === 'filter' ? input.topics : []),
		olympiadIds: JSON.stringify(input.scope === 'filter' ? input.olympiadIds : []),
		requirementHidden: input.requirementHidden
	};
}

/**
 * Creates (`id === null`) or updates a badge and replaces its manual problem
 * list, writing only the rows that changed (the free tier's write quota).
 * Returns the saved badge. The caller then runs {@link recomputeBadge}.
 */
export async function saveBadge(
	db: DB,
	id: number | null,
	input: BadgeInput,
	problemIds: readonly number[]
): Promise<BadgeEntry> {
	const columns = toColumns(input);
	const row =
		id === null
			? await db.insert(badges).values(columns).returning().get()
			: await db
					.update(badges)
					.set({ ...columns, updatedAt: new Date() })
					.where(eq(badges.id, id))
					.returning()
					.get();

	const wanted = new Set(input.scope === 'manual' ? problemIds : []);
	const current = new Set(
		id === null
			? []
			: (
					await db
						.select({ problemId: badgeProblems.problemId })
						.from(badgeProblems)
						.where(eq(badgeProblems.badgeId, row.id))
						.all()
				).map((r) => r.problemId)
	);
	const added = [...wanted].filter((p) => !current.has(p));
	const removed = [...current].filter((p) => !wanted.has(p));

	// Chunked to stay under D1's 100 bound parameters (two per row).
	for (let i = 0; i < added.length; i += 40) {
		await db
			.insert(badgeProblems)
			.values(added.slice(i, i + 40).map((problemId) => ({ badgeId: row.id, problemId })))
			.onConflictDoNothing()
			.run();
	}
	for (let i = 0; i < removed.length; i += 90) {
		await db
			.delete(badgeProblems)
			.where(
				and(
					eq(badgeProblems.badgeId, row.id),
					inArray(badgeProblems.problemId, removed.slice(i, i + 90))
				)
			)
			.run();
	}

	return toBadgeEntry(row);
}

/** Deletes a badge. Its problem links and awards cascade. */
export async function deleteBadge(db: DB, id: number): Promise<BadgeEntry | undefined> {
	const row = await db.delete(badges).where(eq(badges.id, id)).returning().get();
	return row && toBadgeEntry(row);
}
