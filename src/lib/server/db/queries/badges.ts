import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
	badgeProblems,
	badges,
	olympiads,
	problemProgress,
	problems,
	user,
	userBadges,
	years,
	type DB
} from '../index';
import {
	problemRefKey,
	qualifies,
	sortByHolders,
	type BadgeEntry,
	type BadgeProblem,
	type BadgeScope,
	type ProblemRef
} from '#lib/badges.js';
import { parseStringArray } from '#lib/utils/json.js';
import { parseTopics, serializeTopics } from '#lib/utils/topics.js';
import type { ProblemTopic } from '#lib/types.js';

/*
 * Reads and writes for badges and who holds them.
 *
 * Read budget: evaluating one user reads only that user's progress and the
 * badges, since `evaluateUserBadges` runs on every dashboard view and tracked
 * problem. Only `recomputeBadge` (an admin save) scans all of
 * `problem_progress`. Holder counts come from `user_badges` for the same reason.
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
 * Counts only: who holds a badge is never public (docs/auth.md); admins get the
 * names from {@link listHolders}.
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

/** How many people hold one badge. Reads its `user_badges` rows by index. */
export async function countHolders(db: DB, badgeId: number): Promise<number> {
	const row = await db
		.select({ n: count() })
		.from(userBadges)
		.where(eq(userBadges.badgeId, badgeId))
		.get();
	return row?.n ?? 0;
}

/** One person holding a badge, as the admin editor lists them. */
export type BadgeHolder = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	banned: boolean;
	earnedAt: Date;
};

/**
 * Who holds one badge, most recently earned first. **Admin only**: who holds a
 * badge is never public (docs/auth.md), so only `/admin/badges/[id]` may call
 * this. Sorted here rather than in SQL, as the users table is: `earned_at` has
 * no index, and the rows are all read anyway.
 */
export async function listHolders(db: DB, badgeId: number): Promise<BadgeHolder[]> {
	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			banned: user.banned,
			earnedAt: userBadges.earnedAt
		})
		.from(userBadges)
		.innerJoin(user, eq(user.id, userBadges.userId))
		.where(eq(userBadges.badgeId, badgeId))
		.all();
	return rows
		.map((r) => ({ ...r, banned: r.banned ?? false }))
		.sort((a, b) => +b.earnedAt - +a.earnedAt || a.name.localeCompare(b.name));
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
 * result: inserts new awards, deletes lost ones, and writes nothing when nothing
 * changed. Reads only the user's own rows (the read budget above).
 *
 * Because every call re-syncs, awards left stale by a content edit or by two
 * racing calls correct themselves on the user's next view or tracked problem.
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
	const awarding: BadgeEntry[] = [];
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
			awarding.push(badge);
		} else if (!earned && earnedAt) {
			earnedAt = null;
			lost.push(badge.id);
		}
		standings.push({ badge, count: n, earnedAt });
	}

	if (awarding.length === 0 && lost.length === 0) {
		return { rows: toProgressRows(inputs), standings, newlyEarned: [] };
	}

	// Chunked to stay under D1's 100 bound parameters per statement: three per
	// inserted row, one per deleted id plus the user id. A new user's first
	// evaluation can award every badge at once.
	const inserts = [];
	for (let i = 0; i < awarding.length; i += 30) {
		inserts.push(
			db
				.insert(userBadges)
				.values(awarding.slice(i, i + 30).map((b) => ({ userId, badgeId: b.id, earnedAt: now })))
				// A concurrent call that got there first wins, and its row is not
				// returned here, so only one of the two reports the award.
				.onConflictDoNothing()
				.returning({ badgeId: userBadges.badgeId })
		);
	}
	const deletes = [];
	for (let i = 0; i < lost.length; i += 90) {
		deletes.push(
			db
				.delete(userBadges)
				.where(
					and(eq(userBadges.userId, userId), inArray(userBadges.badgeId, lost.slice(i, i + 90)))
				)
		);
	}
	const results = await db.batch(nonEmpty([...inserts, ...deletes]));

	// Only the rows this call inserted, so the "Badge unlocked" toast shows once
	// even when two tracking changes race.
	const inserted = new Set(
		results
			.slice(0, inserts.length)
			.flatMap((r) => r as { badgeId: number }[])
			.map((r) => r.badgeId)
	);
	const newlyEarned = awarding.filter((b) => inserted.has(b.id));
	return { rows: toProgressRows(inputs), standings, newlyEarned };
}

/** The progress rows without `problems.id`, which never reaches the client. */
function toProgressRows(inputs: (ProgressRow & { problemId: number })[]): ProgressRow[] {
	return inputs.map(({ problemId: _, ...rest }) => rest);
}

/**
 * `db.batch` takes a non-empty tuple, which spreading a list of statements
 * loses. Callers only pass lists they know aren't empty.
 */
function nonEmpty<T>(items: T[]): [T, ...T[]] {
	return items as [T, ...T[]];
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
 * The two statements that sync one badge's `user_badges` rows to everyone who
 * now qualifies; existing holders keep their `earned_at`. Returned rather than
 * run, so {@link saveBadge} batches them with the badge's own writes in one
 * transaction. Scans every progress row, so only an admin save runs it, and
 * there is no "recompute all" (one scan per badge).
 */
function recomputeBadge(db: DB, badge: BadgeEntry) {
	const holders = sql`SELECT pp.user_id FROM problem_progress pp
		JOIN problems p ON p.id = pp.problem_id
		JOIN years y ON y.id = p.year_id
		WHERE ${qualifyingCondition(badge)}
		GROUP BY pp.user_id
		HAVING count(*) >= ${badge.requiredCount}`;
	return [
		db.run(sql`DELETE FROM user_badges
			WHERE badge_id = ${badge.id} AND user_id NOT IN (${holders})`),
		// `WHERE true` resolves SQLite's parsing ambiguity between a join's ON and
		// the upsert's ON CONFLICT.
		db.run(sql`INSERT INTO user_badges (user_id, badge_id)
			SELECT user_id, ${badge.id} FROM (${holders}) WHERE true
			ON CONFLICT (user_id, badge_id) DO NOTHING`)
	] as const;
}

// ── Admin editing ───────────────────────────────────────────────────────────

/**
 * The problems of several manual badges in one query, each list in olympiad,
 * year and number order. A badge with no problems left is absent from the map.
 * For the admin editor, and for users only through `/api/badges/[id]` and
 * `/progress/badges`, which leave a hidden badge's list out (docs/data-model.md).
 */
export async function getManualProblemsFor(
	db: DB,
	badgeIds: readonly number[]
): Promise<Map<number, BadgeProblem[]>> {
	const lists = new Map<number, BadgeProblem[]>();
	if (badgeIds.length === 0) return lists;
	const rows = await db
		.select({
			badgeId: badgeProblems.badgeId,
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
		// One JSON parameter, so any number of badges stays under D1's limit.
		.where(
			sql`${badgeProblems.badgeId} IN (SELECT value FROM json_each(${JSON.stringify(badgeIds)}))`
		)
		.orderBy(asc(olympiads.displayOrder), asc(years.olympiadId), asc(years.year), asc(problems.id))
		.all();
	for (const { badgeId, ...problem } of rows) {
		const list = lists.get(badgeId);
		if (list) list.push(problem);
		else lists.set(badgeId, [problem]);
	}
	return lists;
}

/** One manual badge's problems; see {@link getManualProblemsFor}. */
export async function getManualProblems(db: DB, badgeId: number): Promise<BadgeProblem[]> {
	return (await getManualProblemsFor(db, [badgeId])).get(badgeId) ?? [];
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
	const byKey = new Map(rows.map((r) => [problemRefKey(r), r.id]));
	const ids = new Set<number>();
	const missing: ProblemRef[] = [];
	for (const ref of refs) {
		const id = byKey.get(problemRefKey(ref));
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
 * The statements that turn a badge's manual list from `current` into `wanted`,
 * touching only the rows that change (D1 bills per row written). Chunked to
 * stay under D1's 100 bound parameters per statement: two per inserted row,
 * one per deleted id plus the badge id.
 */
function linkWrites(
	db: DB,
	badgeId: number,
	current: ReadonlySet<number>,
	wanted: ReadonlySet<number>
) {
	const added = [...wanted].filter((p) => !current.has(p));
	const removed = [...current].filter((p) => !wanted.has(p));
	const writes = [];
	for (let i = 0; i < added.length; i += 40) {
		writes.push(
			db
				.insert(badgeProblems)
				.values(added.slice(i, i + 40).map((problemId) => ({ badgeId, problemId })))
				.onConflictDoNothing()
		);
	}
	for (let i = 0; i < removed.length; i += 90) {
		writes.push(
			db
				.delete(badgeProblems)
				.where(
					and(
						eq(badgeProblems.badgeId, badgeId),
						inArray(badgeProblems.problemId, removed.slice(i, i + 90))
					)
				)
		);
	}
	return writes;
}

/**
 * Creates (`id === null`) or updates a badge, replaces its manual problem list,
 * and re-evaluates it for every user ({@link recomputeBadge}). Returns the
 * saved badge, or `undefined` when `id` names no badge.
 *
 * An update is one batch (a D1 transaction), so a failure leaves the old badge
 * and awards intact. A create must insert first for its id; if the batch after
 * fails, the badge exists with no awards or list, and saving again repairs it.
 */
export async function saveBadge(
	db: DB,
	id: number | null,
	input: BadgeInput,
	problemIds: readonly number[]
): Promise<BadgeEntry | undefined> {
	const columns = toColumns(input);
	const wanted = new Set(input.scope === 'manual' ? problemIds : []);

	if (id === null) {
		const row = await db.insert(badges).values(columns).returning().get();
		const badge = toBadgeEntry(row);
		await db.batch(
			nonEmpty([...linkWrites(db, row.id, new Set(), wanted), ...recomputeBadge(db, badge)])
		);
		return badge;
	}

	// One round trip for the existence check and the current list.
	const [existing, links] = await db.batch([
		db.select().from(badges).where(eq(badges.id, id)),
		db
			.select({ problemId: badgeProblems.problemId })
			.from(badgeProblems)
			.where(eq(badgeProblems.badgeId, id))
	]);
	if (existing.length === 0) return undefined;

	// What the update will store, so the recompute can be built before it runs.
	const badge = toBadgeEntry({ ...existing[0], ...columns });
	const [updated] = await db.batch([
		db
			.update(badges)
			.set({ ...columns, updatedAt: new Date() })
			.where(eq(badges.id, id))
			.returning(),
		...linkWrites(db, id, new Set(links.map((l) => l.problemId)), wanted),
		...recomputeBadge(db, badge)
	]);
	// Empty only if the badge was deleted since the read above. The update then
	// matched nothing, and any write that referenced the badge failed its foreign
	// key and rolled the whole batch back.
	return updated[0] ? toBadgeEntry(updated[0]) : undefined;
}

/** Deletes a badge. Its problem links and awards cascade. */
export async function deleteBadge(db: DB, id: number): Promise<BadgeEntry | undefined> {
	const row = await db.delete(badges).where(eq(badges.id, id)).returning().get();
	return row && toBadgeEntry(row);
}
