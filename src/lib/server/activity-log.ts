import { activityLog, type DB } from './db';

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
