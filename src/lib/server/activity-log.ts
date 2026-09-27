/*
 * The admin audit log: `logActivity` writes, `listActivity` reads a page.
 * The only query module outside `db/queries/`. If you move it, move both halves.
 */

import { desc, lt } from 'drizzle-orm';
import { activityLog, type DB } from './db';
import type { ActivityEntry } from '$lib/types';

/** Loggable actions, from the `activityLog.action` enum. Labels are in `$lib/activity.ts`. */
export type LogAction = NonNullable<(typeof activityLog.$inferInsert)['action']>;

type ActingUser = { id: string; name: string } | null | undefined;

/**
 * Records a contributor action for the admin "Log" tab. Without a user it
 * silently does nothing rather than throw: the log must never fail a write.
 */
export async function logActivity(
	db: DB,
	user: ActingUser,
	action: LogAction,
	detail: string,
	opts: { olympiadId?: string; year?: number } = {}
) {
	if (!user) return;
	await db
		.insert(activityLog)
		.values({
			userId: user.id,
			userName: user.name,
			action,
			detail,
			olympiadId: opts.olympiadId,
			year: opts.year
		})
		.run();
}

/**
 * One page of the log, newest first, before `before`.
 *
 * Pages by `id` rather than OFFSET: OFFSET reads every skipped row, and new
 * inserts would shift pages. Don't switch to ordering by `created_at`; that
 * needs an index. Fetches one extra row to compute `hasMore`.
 */
export async function listActivity(
	db: DB,
	opts: { before?: number; limit: number }
): Promise<{ entries: ActivityEntry[]; hasMore: boolean }> {
	const rows = await db
		.select({
			id: activityLog.id,
			userName: activityLog.userName,
			action: activityLog.action,
			detail: activityLog.detail,
			olympiadId: activityLog.olympiadId,
			year: activityLog.year,
			createdAt: activityLog.createdAt
		})
		.from(activityLog)
		.where(opts.before === undefined ? undefined : lt(activityLog.id, opts.before))
		.orderBy(desc(activityLog.id))
		.limit(opts.limit + 1)
		.all();

	return { entries: rows.slice(0, opts.limit), hasMore: rows.length > opts.limit };
}
