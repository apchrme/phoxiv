import type { PageServerLoad } from './$types';
import { setPrivateCache } from '$lib/server/cache';

/**
 * The landing page is outside the `(reg)` group, so it does not inherit that
 * layout's cache header and has to set it itself.
 */
export const load: PageServerLoad = ({ setHeaders }) => {
	setPrivateCache(setHeaders);
};
