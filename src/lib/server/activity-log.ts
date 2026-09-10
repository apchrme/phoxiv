/**
 * The admin panel's audit trail, both sides: `logActivity` writes it and
 * `listActivity` reads it back a page at a time.
 *
 * **The one query module outside `db/queries/`**, which `docs/architecture.md`
 * otherwise describes as holding every query, one module per concern. The
 * insert was already the exception, because the action enum and the
 * never-fail-a-write policy below belong with it; honouring the rule properly
 * would mean moving both halves and rewriting ~10 import sites across
 * `/contribute` and `/admin`. Do that or nothing — a half-split, with the read
 * in `db/queries/` importing its row type from the write side, is the worst of
 * the three.
 */

import { desc, lt } from 'drizzle-orm';
import { activityLog, type DB } from './db';
import type { ActivityEntry } from '$lib/types';

/**
 * The set of loggable actions.
 *
 * Derived from the `activityLog.action` column's enum so the two can never drift.
 * `$lib/activity.ts` maps these to display labels for the admin panel.
 */
export type LogAction = NonNullable<(typeof activityLog.$inferInsert)['action']>;

type ActingUser = { id: string; name: string } | null | undefined;

/**
 * Records a contributor action for the admin panel's "Log" tab.
 *
 * No-ops without a signed-in user. In practice there always is one — every call
 * site sits behind a `require*` guard — but the log is an audit trail, not a
 * control, so it must never be the thing that fails a write.
 *
 * The user's name is denormalised into the row on purpose: the log should still
 * read correctly after an account is renamed or deleted.
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
 * One page of the log, newest first.
 *
 * **Keyset on `id`, not OFFSET.** OFFSET still reads and discards every skipped
 * row, so a deep page would cost as much as the unpaginated query this replaced
 * and "Load more" would save nothing. `id` is an AUTOINCREMENT rowid alias, so
 * this is a backwards rowid scan reading exactly `limit + 1` rows and no index
 * rows at all — cheaper than the old `ORDER BY created_at DESC`, which paid
 * index rows *and* table rows.
 *
 * It is also insert-race-immune: new rows take higher ids and can never be
 * re-encountered mid-page, where OFFSET would duplicate rows under a backfill
 * writing as the operator pages.
 *
 * Ordered by `id` but displayed by `created_at`: two rows written in the same
 * millisecond may render in an order their identical timestamps do not explain.
 * Harmless — do not "fix" it back to `created_at` and reintroduce the index read.
 *
 * Over-fetches by one to answer "is there more", the idiom `searchFiles`
 * already uses. Columns are listed explicitly because `db.select()` would ship
 * `userId`, which nothing renders.
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
