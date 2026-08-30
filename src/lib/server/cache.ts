/**
 * The app's two caching policies.
 *
 * Which one a route uses is determined by its location, and that is the whole
 * reason the route tree is split the way it is — see `docs/architecture.md`.
 */

type SetHeaders = (headers: Record<string, string>) => void;

/**
 * For `/api/*`. Caches in Cloudflare's **shared** cache; a browser may keep a
 * copy but can never serve one without asking first.
 *
 * `max-age=0` makes the response stale in a private cache the moment it lands,
 * and `must-revalidate` — which binds private caches too, unlike
 * `proxy-revalidate` — forbids reusing a stale copy without a successful
 * revalidation. Both directives are load-bearing: `max-age=0` alone governs
 * *reuse*, not *storage*, so a browser stays free to hold the body, and an
 * earlier version of this policy leaned on that alone and was wrong about it.
 * Together they put a purge on every visitor's **next** request rather than
 * their second one.
 *
 * `s-maxage=86400` overrides `max-age` for the shared cache, so Cloudflare hits
 * D1 at most once a day. That edge copy is now the only place a payload can go
 * stale: a wrong one persists for up to a day and needs a manual purge. What
 * `must-revalidate` costs is that the revalidation after those 24h blocks the
 * request, where the `stale-while-revalidate` it replaced hid it behind a
 * background refresh.
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
