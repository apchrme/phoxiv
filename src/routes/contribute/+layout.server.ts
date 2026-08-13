import type { LayoutServerLoad } from './$types';
import { requireContributor } from '$lib/server/guard';

/**
 * Gates the whole contribute area. Per-olympiad permission is checked again in
 * each load and action via `requireOlympiadEditor`, because a contributor who
 * may edit one olympiad must not be able to edit another by URL.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	requireContributor(locals);
};
