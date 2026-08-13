import type { PageServerLoad } from './$types';
import { requireOlympiad, toOlympiadEntry } from '$lib/server/db/queries/olympiads';

/**
 * Only the olympiad's own metadata. The years, problems and files are fetched
 * client-side from `/api/olympiads/[olympiad]` so they come out of Cloudflare's
 * shared cache instead of costing a D1 read per visit.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	return { olympiad: toOlympiadEntry(await requireOlympiad(locals.db, params.olympiad)) };
};
