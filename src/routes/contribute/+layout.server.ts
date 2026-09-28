import type { LayoutServerLoad } from './$types';
import { requireContributor } from '$lib/server/guard';

/**
 * Gates the contribute area by role only. Each load and action must still call
 * `requireOlympiadEditor`, or a contributor could edit any olympiad by URL.
 */
export const load: LayoutServerLoad = ({ locals, url }) => {
	requireContributor(locals, url);
};
