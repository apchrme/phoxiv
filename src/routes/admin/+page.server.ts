import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { user } from '$lib/server/db';
import { isProtectedSuperadmin, requireAdmin } from '$lib/server/guard';
import { listActivity } from '$lib/server/activity-log';
import { listOlympiadOptions } from '$lib/server/db/queries/olympiads';
import { actionFail, field, fieldList, fieldOrNull, ok } from '$lib/server/forms';
import { ASSIGNABLE_ROLES } from '$lib/activity';
import {
	ensureFileTextIndex,
	optimizeFileTextIndex,
	pruneFileText
} from '$lib/server/db/queries/files';

/**
 * Activity-log entries per page. The load fetches page 1;
 * `admin/activity/+server.ts` serves the rest behind "Load more".
 */
const LOG_PAGE_SIZE = 25;

/**
 * The roles the dropdown offers, plus `''`, which clears the role to NULL.
 * No control submits `''`, so it isn't in `ASSIGNABLE_ROLES`.
 */
const ACCEPTED_ROLES: readonly string[] = [...ASSIGNABLE_ROLES, ''];

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = requireAdmin(locals);

	// Index stats are expensive, so `admin/index-stats/+server.ts` serves them
	// when the Index tab opens. Don't stream them from here as an unawaited
	// promise: that still runs the query on every page open.
	const [users, olympiads, log] = await Promise.all([
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
			// No `ORDER BY`: `created_at` has no index, so D1 would bill a sort.
			// `UsersTable.svelte` sorts on the client instead.
			.all(),
		listOlympiadOptions(db),
		// Same function as the endpoint, so page 1 also knows `hasMore`.
		listActivity(db, { limit: LOG_PAGE_SIZE })
	]);

	return { users, olympiads, log: log.entries, hasMore: log.hasMore };
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
		// Unbanning is a modification too, so the superadmin is protected here as well.
		if (await isProtectedSuperadmin(db, platform, userId)) {
			return actionFail(403, 'unbanUser', 'This account cannot be modified');
		}

		await db.update(user).set({ banned: false, banReason: null }).where(eq(user.id, userId)).run();

		return ok('unbanUser');
	},

	/**
	 * Recreates the FTS5 table and triggers if missing, then rebuilds the index
	 * from `file_text` (no re-extraction). See docs/data-model.md, "Recovery".
	 */
	ensureIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		await ensureFileTextIndex(db);
		return ok('ensureIndex');
	},

	/**
	 * Merges index segments, with bounded work per call to stay under D1's query
	 * time limit. Run again if there is more to do.
	 */
	optimizeIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		await optimizeFileTextIndex(db);
		return ok('optimizeIndex');
	},

	/** Drops `file_text` rows for files that no longer exist. Reclaims space only. */
	pruneIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		return ok('pruneIndex', { pruned: await pruneFileText(db) });
	}
};
