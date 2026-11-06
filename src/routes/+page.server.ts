import type { PageServerLoad } from './$types';
import { olympiads } from '#lib/server/db/index.js';
import { setNoStore } from '#lib/server/cache.js';
import { evaluateUserBadges } from '#lib/server/db/queries/badges.js';
import { visibleCount, visibleCriteria } from '#lib/badges.js';

/**
 * `/` is the landing page when signed out and the dashboard when signed in.
 *
 * Outside `(reg)`, so it sets its own header, and that header is `no-store`
 * either way. Signed in, a cached dashboard would lag every tracked problem.
 * Signed out, a landing page cached for four hours would still be served right
 * after signing in, since the browser cache doesn't key on the cookie. The
 * landing page reads nothing from D1, so not caching it costs only a render.
 */
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setNoStore(setHeaders);
	if (!locals.user) return { dashboard: null };

	// Evaluating also syncs the user's awards, so the dashboard and the holder
	// counts agree after any content edit since the last visit.
	const [{ rows, standings }, names] = await Promise.all([
		evaluateUserBadges(locals.db, locals.user.id),
		locals.db.select({ id: olympiads.id, name: olympiads.name }).from(olympiads).all()
	]);
	const olympiadNames = Object.fromEntries(names.map((o) => [o.id, o.name]));

	// Page data is readable in the page source, so a hidden requirement and the
	// progress towards it are nulled here, not just left unrendered, until the
	// user earns the badge.
	return {
		dashboard: {
			rows,
			badges: standings.map(({ badge, count, earnedAt }) => ({
				id: badge.id,
				name: badge.name,
				description: badge.description,
				icon: badge.icon,
				color: badge.color,
				...visibleCriteria(badge, olympiadNames, earnedAt !== null),
				count: visibleCount(badge, count, earnedAt !== null),
				earnedAt
			}))
		}
	};
};
