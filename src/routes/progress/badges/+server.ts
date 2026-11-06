import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { olympiads } from '#lib/server/db/index.js';
import { setNoStore } from '#lib/server/cache.js';
import { evaluateUserBadges } from '#lib/server/db/queries/badges.js';
import { describeBadge, visibleCount, type BadgeProgressMap } from '#lib/badges.js';

/**
 * The signed-in user's standing on every badge, for `/badges`. Outside `/api/`
 * for the same reason as `/progress`. Evaluating also syncs the user's awards,
 * so it can write; it reads only the user's own rows.
 *
 * It also reveals the requirement of each hidden badge the user holds, which
 * the shared-cached `/api/badges` can't do.
 *
 * The only input is `locals.user.id`. Never add a user id parameter.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	// Before the guard, so a 401 is uncached too.
	setNoStore(setHeaders);

	if (!locals.user) error(401, 'Not signed in');

	const { standings } = await evaluateUserBadges(locals.db, locals.user.id);

	// Olympiad names only go into a revealed sentence, so they are read only
	// when the user holds a hidden badge.
	const reveal = standings.filter((s) => s.badge.requirementHidden && s.earnedAt !== null);
	const olympiadNames =
		reveal.length === 0
			? {}
			: Object.fromEntries(
					(
						await locals.db.select({ id: olympiads.id, name: olympiads.name }).from(olympiads).all()
					).map((o) => [o.id, o.name])
				);

	const body: BadgeProgressMap = Object.fromEntries(
		standings.map((s) => {
			const earned = s.earnedAt !== null;
			return [
				s.badge.id,
				{
					count: visibleCount(s.badge, s.count, earned),
					earnedAt: s.earnedAt?.toISOString() ?? null,
					revealed: reveal.includes(s)
						? {
								summary: describeBadge(s.badge, olympiadNames),
								requiredCount: s.badge.requiredCount
							}
						: null
				}
			];
		})
	);
	return Response.json(body);
};
