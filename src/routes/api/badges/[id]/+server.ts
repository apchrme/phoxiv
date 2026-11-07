import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { olympiads } from '#lib/server/db/index.js';
import { setSharedCache } from '#lib/server/cache.js';
import { countHolders, getBadge, getManualProblems } from '#lib/server/db/queries/badges.js';
import { isRequirementVisible, toPublicBadge, type PublicBadgeDetail } from '#lib/badges.js';

/**
 * One badge for its own page, `/badges/[id]`: what `/api/badges` gives, plus a
 * manual badge's problem list. Shared-cached for a day like `/api/badges`, so
 * an admin's edit to the list takes that long to show.
 *
 * The list is the requirement, so a hidden manual badge's list is left out like
 * the rest of its criteria; a holder gets it from `/progress/badges`. Never
 * names who holds the badge, only how many (docs/auth.md).
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	const id = Number(params.id);
	// Raise the 404 before setting the cache header, or the 404 is cached for a
	// day (as `/api/olympiads/[olympiad]` explains).
	if (!Number.isInteger(id) || id <= 0) error(404, 'Badge not found');
	const badge = await getBadge(locals.db, id);
	if (!badge) error(404, 'Badge not found');
	setSharedCache(setHeaders);

	const listed = badge.scope === 'manual' && isRequirementVisible(badge, false);
	const [holders, problems, olympiadNames] = await Promise.all([
		countHolders(locals.db, id),
		listed ? getManualProblems(locals.db, id) : null,
		// Names only go into a filter badge's sentence.
		badge.scope === 'filter' && badge.olympiadIds.length > 0
			? locals.db
					.select({ id: olympiads.id, name: olympiads.name })
					.from(olympiads)
					.all()
					.then((rows) => Object.fromEntries(rows.map((o) => [o.id, o.name])))
			: {}
	]);

	const body: PublicBadgeDetail = {
		...toPublicBadge({ ...badge, holders }, olympiadNames),
		problems
	};
	return Response.json(body);
};
