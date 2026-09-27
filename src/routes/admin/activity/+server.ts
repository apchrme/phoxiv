import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/guard';
import { listActivity } from '$lib/server/activity-log';

/**
 * Activity-log pages after the first, for "Load more", keyed on `?before=<id>`.
 *
 * Calls `requireAdmin` itself: a `+server.ts` runs no layout loads, so
 * `admin/+layout.server.ts` doesn't protect it. Kept out of `/api/` so the
 * audit log never reaches the shared cache.
 */

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

export const GET: RequestHandler = async ({ url, locals }) => {
	const { db } = requireAdmin(locals);

	// Clamp the limit, or `?limit=100000` reads 100k D1 rows in one request.
	const requested = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
	const limit = Number.isFinite(requested)
		? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
		: DEFAULT_LIMIT;

	// Reject a bad cursor. Falling back to page 1 would give the client duplicate
	// ids, and its keyed `{#each}` would throw.
	const raw = url.searchParams.get('before');
	let before: number | undefined;
	if (raw !== null) {
		const n = Number(raw);
		if (!Number.isInteger(n) || n <= 0) error(400, 'Invalid cursor');
		before = n;
	}

	return json(await listActivity(db, { before, limit }));
};
