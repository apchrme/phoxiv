import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/guard';
import { listActivity } from '$lib/server/activity-log';

/**
 * Pages of the activity log past the first, for the panel's "Load more".
 *
 * The load hands the component page 1; this serves every page after it, keyed
 * on `?before=<id>` — see {@link listActivity} for why the cursor is the `id`
 * and not an offset or a timestamp.
 *
 * Named `activity/`, not `log/`: a route holding both a `+page` and a
 * `+server` resolves by `Accept` header, which is a mess, and `/admin/log` is a
 * plausible future page.
 *
 * **`requireAdmin` is called here, not inherited.** A `+server.ts` runs no
 * layout loads, so `admin/+layout.server.ts` does not cover it — the same
 * reason `reindex/+server.ts` guards itself. The layout is not a perimeter.
 *
 * No cache headers, and deliberately not under `/api/`, where every handler
 * calls `setSharedCache()` — an audit trail must never reach Cloudflare's
 * shared cache.
 */

/** Rows one request may ask for. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export const GET: RequestHandler = async ({ url, locals }) => {
	const { db } = requireAdmin(locals);

	// The clamp is the whole defence: this endpoint is a read-amplification
	// vector, and `?limit=100000` would otherwise be 100k D1 rows read on one
	// request. Same shape as `reindex/+server.ts`.
	const requested = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
	const limit = Number.isFinite(requested)
		? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
		: DEFAULT_LIMIT;

	// A malformed cursor must 400 rather than fall back to the top page: falling
	// back would re-serve page 1, the client would append it to what it already
	// has, and the table's keyed `{#each}` would throw on the duplicate ids.
	const raw = url.searchParams.get('before');
	let before: number | undefined;
	if (raw !== null) {
		const n = Number(raw);
		if (!Number.isInteger(n) || n <= 0) error(400, 'Invalid cursor');
		before = n;
	}

	return json(await listActivity(db, { before, limit }));
};
