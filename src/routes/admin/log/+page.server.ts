import type { PageServerLoad } from './$types';
import { requireAdmin } from '#lib/server/guard.js';
import { listActivity } from '#lib/server/activity-log.js';

/**
 * Activity-log entries per page. The load fetches page 1;
 * `admin/activity/+server.ts` serves the rest behind "Load more".
 */
const LOG_PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = requireAdmin(locals);
	// Same function as the endpoint, so page 1 also knows `hasMore`.
	const log = await listActivity(db, { limit: LOG_PAGE_SIZE });
	return { log: log.entries, hasMore: log.hasMore };
};
