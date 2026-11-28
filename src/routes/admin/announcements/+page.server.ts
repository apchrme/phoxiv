import type { PageServerLoad } from './$types';
import { requireAdmin } from '#lib/server/guard.js';
import { listAnnouncementsForAdmin } from '#lib/server/db/queries/announcements.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = requireAdmin(locals);
	return { announcements: await listAnnouncementsForAdmin(db) };
};
