import type { RequestHandler } from './$types';
import { olympiads } from '#lib/server/db/index.js';
import { setSharedCache } from '#lib/server/cache.js';
import { listBadges } from '#lib/server/db/queries/badges.js';
import { toPublicBadge, type PublicBadge } from '#lib/badges.js';

/**
 * Every badge with its holder count, most holders first, for `/badges`.
 * Shared-cached for a day, so an admin edit or a new holder can take that long
 * to show (as with contributor edits), and so can the order. The counts come
 * from `user_badges`, one aggregate per cache miss, never from re-evaluating
 * users. A hidden requirement is left out by `toPublicBadge`.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);

	const [list, names] = await Promise.all([
		listBadges(locals.db),
		locals.db.select({ id: olympiads.id, name: olympiads.name }).from(olympiads).all()
	]);
	const olympiadNames = Object.fromEntries(names.map((o) => [o.id, o.name]));

	const body: PublicBadge[] = list.map((badge) => toPublicBadge(badge, olympiadNames));
	return Response.json(body);
};
