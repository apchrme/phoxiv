import type { PageServerLoad } from './$types';
import { setNoStore } from '#lib/server/cache.js';
import { evaluateUserBadges } from '#lib/server/db/queries/badges.js';
import { getOlympiadNames } from '#lib/server/db/queries/olympiads.js';
import { toVisibleBadge, visibleCount } from '#lib/badges.js';

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
	// counts agree after any content edit since the last visit. The names are
	// read alongside it: waiting to see whether a badge needs them would cost
	// another round trip.
	const [{ rows, standings }, olympiadNames] = await Promise.all([
		evaluateUserBadges(locals.db, locals.user.id),
		getOlympiadNames(locals.db)
	]);

	// Page data is readable in the page source, so a hidden requirement and the
	// progress towards it are nulled here, not just left unrendered, until the
	// user earns the badge.
	return {
		dashboard: {
			rows,
			badges: standings.map(({ badge, count, earnedAt }) => ({
				...toVisibleBadge(badge, olympiadNames, earnedAt !== null),
				count: visibleCount(badge, count, earnedAt !== null),
				earnedAt
			}))
		}
	};
};
