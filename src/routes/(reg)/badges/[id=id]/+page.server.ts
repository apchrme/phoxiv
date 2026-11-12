import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getBadge } from '#lib/server/db/queries/badges.js';
import { badgeFace } from '#lib/badges.js';

/**
 * Only what the header shows, so an unknown id is a real 404 and the title is
 * server-rendered, as on the olympiad page: one read of the badge's own row.
 * A malformed id never gets here: the `id` matcher (src/params.ts) 404s it.
 * The criteria, holder count and problem list come from the shared-cached
 * `/api/badges/[id]`, and the viewer's standing from the uncached
 * `/progress/badges` (docs/architecture.md).
 *
 * Never the criteria: this page is in `(reg)` and cached in the browser, and
 * the criteria may be hidden from this viewer. `badgeFace` picks the safe
 * fields one by one.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const badge = await getBadge(locals.db, params.id);
	if (!badge) error(404, 'Badge not found');
	return { badge: badgeFace(badge) };
};
