import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getOlympiadProgress } from '$lib/server/db/queries/progress';

/**
 * The signed-in user's progress on one olympiad, as a `ProgressMap`, plus every
 * problem's configured maximum score.
 *
 * **Deliberately not under `/api/`.** Everything there sets
 * `setSharedCache()` and is held in Cloudflare's shared cache for a day, which
 * would be one user's answers served to every visitor. Keeping this route
 * outside that directory makes the mistake structurally hard to make; the
 * `no-store` below is the second line of defence.
 *
 * It is also why `maxScore` is *not* on `ProblemEntry`: the tracking UI is the
 * only thing that needs it, only signed-in users see it, and adding it to the
 * shared payload would leave a freshly deployed client reading a day-old body
 * with no maximums in it until someone purged the dashboard.
 *
 * Read by a client `fetch` rather than by the page load on purpose.
 * `(reg)/+layout.server.ts` already sets `PRIVATE_CACHE_CONTROL` and SvelteKit
 * refuses the same header twice, so a page load could not downgrade itself to
 * `no-store` — four hours of privately cached `__data.json` would serve stale
 * progress. `+server.ts` runs no layout loads, so neither that header nor
 * `+layout.ts`'s legacy redirects apply here.
 */
export const GET: RequestHandler = async ({ params, locals, setHeaders }) => {
	// Set before the guard, unlike `/api/olympiads/[olympiad]`, which must raise
	// its 404 first: there the header is the thing that would be cached wrongly,
	// here it is the thing that stops any of this being cached at all.
	setHeaders({ 'cache-control': 'private, no-store' });

	if (!locals.user) error(401, 'Not signed in');

	// No `requireOlympiad`: an unknown id yields an empty map, which is what the
	// page would render anyway, and it saves a D1 read on every navigation.
	return json(await getOlympiadProgress(locals.db, params.olympiad, locals.user.id));
};
