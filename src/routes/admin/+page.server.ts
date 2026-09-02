import type { Actions, PageServerLoad } from './$types';
import { desc, eq } from 'drizzle-orm';
import { activityLog, user } from '$lib/server/db';
import { isProtectedSuperadmin, requireAdmin } from '$lib/server/guard';
import { listOlympiadOptions } from '$lib/server/db/queries/olympiads';
import { actionFail, field, fieldList, fieldOrNull, ok } from '$lib/server/forms';
import { ASSIGNABLE_ROLES } from '$lib/activity';
import {
	ensureFileTextIndex,
	getFileTextStats,
	optimizeFileTextIndex,
	pruneFileText
} from '$lib/server/db/queries/files';

/** How many activity-log entries the panel shows. */
const LOG_LIMIT = 100;

/**
 * What `setRole` accepts: the roles the dropdown offers, plus `''`.
 *
 * The empty string clears the role back to NULL. It is input-only — no control
 * submits it deliberately — which is why it is added here rather than kept in
 * the shared `ASSIGNABLE_ROLES` the dropdown iterates.
 */
const ACCEPTED_ROLES: readonly string[] = [...ASSIGNABLE_ROLES, ''];

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = requireAdmin(locals);

	// Four independent reads — one of them used to hide inside the return object,
	// which is why this read like two sequential awaits rather than three.
	const [users, olympiads, log, fileText] = await Promise.all([
		db
			.select({
				id: user.id,
				name: user.name,
				email: user.email,
				image: user.image,
				role: user.role,
				banned: user.banned,
				banReason: user.banReason,
				createdAt: user.createdAt,
				assignedOlympiads: user.assignedOlympiads
			})
			.from(user)
			.orderBy(user.createdAt)
			.all(),
		listOlympiadOptions(db),
		db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(LOG_LIMIT).all(),
		getFileTextStats(db)
	]);

	return { users, olympiads, log, fileText };
};

export const actions: Actions = {
	setRole: async ({ request, locals, platform }) => {
		const { db, user: actor } = requireAdmin(locals);
		const data = await request.formData();
		const userId = field(data, 'userId');
		const role = field(data, 'role');

		if (!userId) return actionFail(400, 'setRole', 'User ID required');
		// Without this an admin could lock themselves out of the panel.
		if (userId === actor.id) return actionFail(400, 'setRole', 'You cannot change your own role');
		if (await isProtectedSuperadmin(db, platform, userId)) {
			return actionFail(403, 'setRole', 'This account cannot be modified');
		}
		if (!ACCEPTED_ROLES.includes(role)) return actionFail(400, 'setRole', 'Invalid role');

		await db
			.update(user)
			.set({ role: role || null })
			.where(eq(user.id, userId))
			.run();

		return ok('setRole');
	},

	/** Admins choose which olympiads a contributor may edit. */
	setAssignedOlympiads: async ({ request, locals, platform }) => {
		const { db, user: actor } = requireAdmin(locals);
		const data = await request.formData();
		const userId = field(data, 'userId');
		const olympiadIds = fieldList(data, 'olympiadId');

		if (!userId) return actionFail(400, 'setAssignedOlympiads', 'User ID required');
		if (userId === actor.id) {
			return actionFail(400, 'setAssignedOlympiads', 'You cannot change your own assignments');
		}
		if (await isProtectedSuperadmin(db, platform, userId)) {
			return actionFail(403, 'setAssignedOlympiads', 'This account cannot be modified');
		}

		await db
			.update(user)
			.set({ assignedOlympiads: JSON.stringify(olympiadIds) })
			.where(eq(user.id, userId))
			.run();

		return ok('setAssignedOlympiads');
	},

	banUser: async ({ request, locals, platform }) => {
		const { db, user: actor } = requireAdmin(locals);
		const data = await request.formData();
		const userId = field(data, 'userId');
		const reason = fieldOrNull(data, 'reason');

		if (!userId) return actionFail(400, 'banUser', 'User ID required');
		if (userId === actor.id) return actionFail(400, 'banUser', 'You cannot ban yourself');
		if (await isProtectedSuperadmin(db, platform, userId)) {
			return actionFail(403, 'banUser', 'This account cannot be modified');
		}

		await db.update(user).set({ banned: true, banReason: reason }).where(eq(user.id, userId)).run();

		return ok('banUser');
	},

	unbanUser: async ({ request, locals, platform }) => {
		const { db } = requireAdmin(locals);
		const data = await request.formData();
		const userId = field(data, 'userId');

		if (!userId) return actionFail(400, 'unbanUser', 'User ID required');
		// The superadmin check belongs here too: unbanning is a modification, and
		// leaving it off made the protection inconsistent with its siblings.
		if (await isProtectedSuperadmin(db, platform, userId)) {
			return actionFail(403, 'unbanUser', 'This account cannot be modified');
		}

		await db.update(user).set({ banned: false, banReason: null }).where(eq(user.id, userId)).run();

		return ok('unbanUser');
	},

	/**
	 * Re-runs the FTS5 DDL idempotently, then rebuilds the index from `file_text`.
	 *
	 * The recovery path for the one hand-written migration. Because the index is
	 * **external content**, a rebuild reconstructs it from the stored text with no
	 * re-extraction at all — which is what makes losing the FTS objects (to a stray
	 * `db:push`, say) an inconvenience rather than a re-index of the whole corpus.
	 */
	ensureIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		await ensureFileTextIndex(db);
		return ok('ensureIndex');
	},

	/**
	 * Merges the index's segments. Worth one run after a large backfill.
	 *
	 * Bounded work per call rather than a single `('optimize')`, which is
	 * unbounded and would risk D1's 30-second query cap on a large corpus. Run it
	 * again if it has more to do.
	 */
	optimizeIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		await optimizeFileTextIndex(db);
		return ok('optimizeIndex');
	},

	/**
	 * Drops `file_text` rows whose url no longer appears in either file table.
	 *
	 * Hygiene only. `searchFiles` INNER JOINs back to those tables, so an orphan
	 * row is unreachable rather than wrong — this reclaims the bytes, it does not
	 * fix a bug.
	 */
	pruneIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		return ok('pruneIndex', { pruned: await pruneFileText(db) });
	}
};
