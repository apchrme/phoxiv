import type { LayoutServerLoad } from './$types';
import { setPrivateCache } from '$lib/server/cache';

/**
 * Applies the browser-local cache policy to every page in the `(reg)` group.
 *
 * This is the entire reason the group exists — see `docs/architecture.md`.
 */
export const load: LayoutServerLoad = ({ setHeaders }) => {
	setPrivateCache(setHeaders);
};
