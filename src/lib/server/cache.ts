/**
 * The app's two caching policies.
 *
 * Which one a route uses is determined by its location, and that is the whole
 * reason the route tree is split the way it is — see `docs/architecture.md`.
 */

type SetHeaders = (headers: Record<string, string>) => void;

/**
 * For `/api/*`. Caches in Cloudflare's **shared** cache, not the browser's.
 *
 * `s-maxage=86400` means the shared cache refetches at most once a day.
 * A wrong payload therefore persists for up to a day and needs a manual purge.
 */
export const SHARED_CACHE_CONTROL = 'max-age=0, s-maxage=86400, must-revalidate';

/**
 * For pages under `(reg)`. Caches in the visitor's **own** browser for four
 * hours, then revalidates. `private` keeps it out of any shared cache, because
 * these responses can embed the signed-in user.
 */
export const PRIVATE_CACHE_CONTROL = 'max-age=14400, must-revalidate, private';

/** Applies {@link SHARED_CACHE_CONTROL}. Use in `/api/*` endpoints. */
export function setSharedCache(setHeaders: SetHeaders): void {
	setHeaders({ 'cache-control': SHARED_CACHE_CONTROL });
}

/** Applies {@link PRIVATE_CACHE_CONTROL}. Use in `(reg)` page loads. */
export function setPrivateCache(setHeaders: SetHeaders): void {
	setHeaders({ 'cache-control': PRIVATE_CACHE_CONTROL });
}
