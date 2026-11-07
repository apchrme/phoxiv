import type { PageServerLoad } from './$types';
import { requireAdmin } from '#lib/server/guard.js';
import { listOlympiadOptions } from '#lib/server/db/queries/olympiads.js';
import { listBadges } from '#lib/server/db/queries/badges.js';

export const load: PageServerLoad = async ({ locals }) => {
	const { db } = requireAdmin(locals);
	const [badges, olympiads] = await Promise.all([
		// Cheap: one row per badge, and one aggregate over `user_badges`.
		listBadges(db),
		// Names the olympiads in each badge's criteria.
		listOlympiadOptions(db)
	]);
	return { badges, olympiads };
};
