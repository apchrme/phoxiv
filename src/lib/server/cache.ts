/*
 * The three caching policies. A route's location decides which it uses; see
 * docs/architecture.md.
 */

type SetHeaders = (headers: Record<string, string>) => void;

/**
 * For `/api/*`. Cloudflare's shared cache keeps it a day (`s-maxage`), so a bad
 * payload needs a manual purge. Keep `must-revalidate`: `max-age=0` alone lets
 * browsers reuse a stored copy, and a purge would not reach them.
 */
export const SHARED_CACHE_CONTROL = 'max-age=0, s-maxage=86400, must-revalidate';

/**
 * For pages under `(reg)`. Browser-only cache for four hours. `private` keeps it
 * out of shared caches because these pages can include the signed-in user.
 */
export const PRIVATE_CACHE_CONTROL = 'max-age=14400, must-revalidate, private';

/**
 * For per-user data that changes as the user acts: the progress endpoints and
 * `/`, whose dashboard counts would otherwise lag a tracked problem by hours,
 * and whose cached landing page would otherwise outlive a sign-in.
 */
export const NO_STORE_CACHE_CONTROL = 'private, no-store';

/** Applies {@link SHARED_CACHE_CONTROL}. Use in `/api/*` endpoints. */
export function setSharedCache(setHeaders: SetHeaders): void {
	setHeaders({ 'cache-control': SHARED_CACHE_CONTROL });
}

/** Applies {@link PRIVATE_CACHE_CONTROL}. Use in `(reg)` page loads. */
export function setPrivateCache(setHeaders: SetHeaders): void {
	setHeaders({ 'cache-control': PRIVATE_CACHE_CONTROL });
}

/**
 * Applies {@link NO_STORE_CACHE_CONTROL}. In a per-user endpoint, call it before
 * the sign-in check so the 401 is uncached too.
 */
export function setNoStore(setHeaders: SetHeaders): void {
	setHeaders({ 'cache-control': NO_STORE_CACHE_CONTROL });
}
