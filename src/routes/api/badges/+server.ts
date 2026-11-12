import type { RequestHandler } from './$types';
import { setSharedCache } from '#lib/server/cache.js';
import { listBadges } from '#lib/server/db/queries/badges.js';
import { getOlympiadNames } from '#lib/server/db/queries/olympiads.js';
import { toPublicBadge, type PublicBadge } from '#lib/badges.js';

/**
 * Every badge with its holder count, most holders first, for `/badges`.
 * Shared-cached for a day, so an edit or a new holder can take that long to
 * show. The counts are one aggregate over `user_badges`, never a re-evaluation
 * of users. A hidden requirement is left out by `toPublicBadge`.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);

	// The names are read alongside the badges: waiting to see whether one
	// needs them would cost another round trip.
	const [list, olympiadNames] = await Promise.all([
		listBadges(locals.db),
		getOlympiadNames(locals.db)
	]);

	const body: PublicBadge[] = list.map((badge) => toPublicBadge(badge, olympiadNames));
	return Response.json(body);
};
