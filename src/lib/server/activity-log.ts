import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { activityLog } from './db/schema.js';

export type LogAction =
	| 'create_olympiad'
	| 'update_olympiad'
	| 'upload_icon'
	| 'remove_icon'
	| 'add_year'
	| 'delete_year'
	| 'save_metadata'
	| 'upload_file'
	| 'delete_file'
	| 'import_files';

type ActingUser = { id: string; name: string } | null | undefined;

/**
 * Records a contributor action to the activity log for display on the admin
 * "Log" tab. No-ops if there's no signed-in user (shouldn't happen in
 * practice, since every call site is already gated by requireOlympiadEditor
 * or requireAdmin).
 */
export async function logActivity(
	db: DrizzleD1Database,
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