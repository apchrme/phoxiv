/*
 * The two caching policies. A route's location decides which it uses; see
 * docs/architecture.md.
 */

type SetHeaders = (headers: Record<string, string>) => void;

/**
 * For `/api/*`. Cloudflare's shared cache keeps it for a day (`s-maxage`), so a
 * bad payload needs a manual purge. Browsers must revalidate every time:
 * `max-age=0` alone would still let them reuse a stored copy, so keep
 * `must-revalidate` too. That way a purge reaches every visitor on their next
 * request.
 */
export const SHARED_CACHE_CONTROL = 'max-age=0, s-maxage=86400, must-revalidate';

/**
 * For pages under `(reg)`. Browser-only cache for four hours. `private` keeps it
 * out of shared caches because these pages can include the signed-in user.
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
