import type { LayoutServerLoad } from './$types';
import { setPrivateCache } from '$lib/server/cache';

/**
 * Sets the private cache header on every page in `(reg)`, the group's only
 * purpose. See docs/architecture.md, "Caching and the route tree".
 */
export const load: LayoutServerLoad = ({ setHeaders }) => {
	setPrivateCache(setHeaders);
};
