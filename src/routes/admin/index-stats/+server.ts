import type { RequestHandler } from './$types';
import { requireAdmin } from '#lib/server/guard.js';
import { getFileTextStats } from '#lib/server/db/queries/files.js';

/**
 * The Index tab's counts, fetched when the tab is opened rather than on page
 * load, because these queries are most of what `/admin` would otherwise cost.
 *
 * `requireAdmin` is called here because a `+server.ts` runs no layout loads, so
 * `admin/+layout.server.ts` does not cover it.
 *
 * Not under `/api/`, whose handlers set the shared cache header: admin stats
 * must never be shared-cached.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { db } = requireAdmin(locals);
	return Response.json(await getFileTextStats(db));
};
