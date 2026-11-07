import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBadge } from '#lib/server/db/queries/badges.js';

/**
 * Only what the header shows, so an unknown id is a real 404 and the title is
 * server-rendered, as on the olympiad page: one read of the badge's own row.
 * The criteria, holder count and problem list come from the shared-cached
 * `/api/badges/[id]`, and the viewer's standing from the uncached
 * `/progress/badges` (docs/architecture.md).
 *
 * Never the criteria: this page is in `(reg)` and cached in the browser, and
 * the criteria may be hidden from this viewer.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Badge not found');
	const badge = await getBadge(locals.db, id);
	if (!badge) error(404, 'Badge not found');
	return {
		badge: {
			id: badge.id,
			name: badge.name,
			description: badge.description,
			icon: badge.icon,
			color: badge.color
		}
	};
};
