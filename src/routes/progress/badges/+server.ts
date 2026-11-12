import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setNoStore } from '#lib/server/cache.js';
import { evaluateUserBadges, getManualProblemsFor } from '#lib/server/db/queries/badges.js';
import { getOlympiadNames } from '#lib/server/db/queries/olympiads.js';
import {
	describeBadge,
	needsOlympiadNames,
	visibleCount,
	type BadgeProgressMap
} from '#lib/badges.js';

/**
 * The signed-in user's standing on every badge, for `/badges`. Outside `/api/`
 * for the same reason as `/progress`. Evaluating also syncs the user's awards,
 * so it can write; it reads only the user's own rows.
 *
 * It also reveals the requirement of each hidden badge the user holds, which
 * the shared-cached `/api/badges` can't do: the sentence, the count and, for a
 * manual badge, its problem list, which `/api/badges/[id]` leaves out.
 *
 * The only input is `locals.user.id`. Never add a user id parameter.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	// Before the guard, so a 401 is uncached too.
	setNoStore(setHeaders);

	if (!locals.user) error(401, 'Not signed in');

	const { standings } = await evaluateUserBadges(locals.db, locals.user.id);

	// What it reveals needs olympiad names (for a filter badge's sentence) and
	// the hidden manual lists, both read only when the user holds a hidden badge
	// that uses them, which is usually none. One round trip for both.
	const reveal = new Set(standings.filter((s) => s.badge.requirementHidden && s.earnedAt !== null));
	const revealed = [...reveal].map((s) => s.badge);
	const [olympiadNames, lists] = await Promise.all([
		needsOlympiadNames(revealed) ? getOlympiadNames(locals.db) : {},
		getManualProblemsFor(
			locals.db,
			revealed.filter((b) => b.scope === 'manual').map((b) => b.id)
		)
	]);

	const body: BadgeProgressMap = Object.fromEntries(
		standings.map((s) => {
			const earned = s.earnedAt !== null;
			return [
				s.badge.id,
				{
					count: visibleCount(s.badge, s.count, earned),
					earnedAt: s.earnedAt?.toISOString() ?? null,
					revealed: reveal.has(s)
						? {
								summary: describeBadge(s.badge, olympiadNames),
								requiredCount: s.badge.requiredCount,
								// A manual badge whose problems were all removed has no
								// entry: an empty list, as `/api/badges/[id]` gives.
								problems: s.badge.scope === 'manual' ? (lists.get(s.badge.id) ?? []) : null
							}
						: null
				}
			];
		})
	);
	return Response.json(body);
};
