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
 * - `max-age=0` marks the response stale for the browser the moment it arrives,
 *   so it revalidates instead of reusing a copy outright. It does **not** stop
 *   the browser keeping one, which an earlier version of this comment claimed:
 *   `stale-while-revalidate` below has no shared-cache-only spelling, so a
 *   returning visitor can be served their *own* week-old copy while the browser
 *   refreshes in the background — and a dashboard purge cannot reach that. A
 *   content edit therefore tends to appear on someone's *second* load, not their
 *   first. Accepted deliberately: this is archive content that changes rarely,
 *   and `cache: 'no-store'` on every client `fetch` would be the fix if that
 *   ever stops being true.
 * - `s-maxage=86400` means the shared cache refetches at most once a day.
 * - `stale-while-revalidate=604800` lets the shared cache keep serving the stale
 *   copy for a week past that while it revalidates in the background, so nobody
 *   waits on a cache miss unless the site goes a whole week without a visitor.
 *
 * A wrong payload therefore persists for up to a day and needs a manual purge.
 */
export const SHARED_CACHE_CONTROL = 'max-age=0, s-maxage=86400, stale-while-revalidate=604800';

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
