import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllProgress } from '$lib/server/db/queries/progress';

/**
 * Every problem the signed-in user has tracked, across every olympiad, as a
 * `GlobalProgressMap`.
 *
 * Fetched once per session by the ⌘K dialog, whose progress filter spans the
 * archive and so cannot use the per-olympiad endpoint.
 *
 * Three placements were rejected, each for its own reason:
 *
 * - **Not under `/api/`.** Everything there calls `setSharedCache()`, which
 *   would serve one user's answers to every visitor. Keeping this outside that
 *   directory makes the mistake structurally hard to make; the `no-store` below
 *   is the second line of defence, not the first.
 * - **Not under `(reg)`.** That group exists solely to apply the four-hour
 *   private *page* header, which a `+server.ts` never receives anyway. Out here
 *   it sits beside `admin/` and `contribute/`, the other deliberately uncached
 *   things.
 * - **Not `/olympiads/progress`.** A static segment there would win over
 *   `olympiads/[olympiad]` and permanently shadow an olympiad whose id happened
 *   to be `progress` — and `olympiads.id` is a free-form, contributor-set TEXT
 *   key.
 *
 * **The only input is `locals.user.id`.** Nothing is read from the URL, so there
 * is no id to confuse and no way to ask for somebody else's map. A future
 * `?user=` or `?mine=1` would therefore be wrong on its face.
 *
 * The client treats any non-`ok` response as an empty map and does not toast,
 * mirroring the per-olympiad endpoint: tracking is an enhancement, and a failure
 * here should leave every problem looking untracked rather than break search.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	// Set before the guard, exactly as the per-olympiad endpoint does: the header
	// is the thing that stops any of this being cached at all, so a 401 must carry
	// it too.
	setHeaders({ 'cache-control': 'private, no-store' });

	if (!locals.user) error(401, 'Not signed in');

	return json(await getAllProgress(locals.db, locals.user.id));
};
