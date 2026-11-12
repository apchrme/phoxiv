import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBadge } from '#lib/server/db/queries/badges.js';
import { badgeFace } from '#lib/badges.js';

/**
 * Only what the header shows, from the badge's own row, so an unknown id is a
 * real 404 and the title is server-rendered. The rest comes from
 * `/api/badges/[id]` and `/progress/badges` (docs/architecture.md).
 *
 * Never the criteria: this page is browser-cached in `(reg)`, and the criteria
 * may be hidden from this viewer. `badgeFace` picks the safe fields one by one.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const badge = await getBadge(locals.db, params.id);
	if (!badge) error(404, 'Badge not found');
	return { badge: badgeFace(badge) };
};
