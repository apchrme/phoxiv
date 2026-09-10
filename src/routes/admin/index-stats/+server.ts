import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/guard';
import { getFileTextStats } from '$lib/server/db/queries/files';

/**
 * The Index tab's counts, fetched on first open rather than on page load.
 *
 * **This is the whole point of the endpoint.** The two queries behind it — the
 * `file_text` status `GROUP BY` and the `year_files ∪ problem_files` count —
 * are ~4,500 D1 rows, 93% of what opening `/admin` used to cost, and the panel
 * opens on Users so most visits never looked at them. Paying it when someone
 * clicks Index is the difference between ~4,870 rows per open and ~171. The
 * remainder is irreducible without a counters table: both url columns are
 * indexed, so the UNION is already an index-only scan and 2,256 rows is simply
 * the price of a truthful count.
 *
 * **`requireAdmin` is called here, not inherited.** A `+server.ts` runs no
 * layout loads, so `admin/+layout.server.ts` does not cover it — the same
 * reason `reindex/+server.ts` guards itself. `docs/auth.md` puts it bluntly:
 * the layout is not a perimeter.
 *
 * **Not under `/api/`.** Every handler there calls `setSharedCache()`, and one
 * admin's stats must never reach Cloudflare's shared cache. Living under
 * `admin/` also means no `/api/*` shape changed, so there is nothing to purge.
 * No cache headers at all, like everything else under `/admin`.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { db } = requireAdmin(locals);
	return json(await getFileTextStats(db));
};
