/**
 * Shared constants that both the browser and the server need.
 *
 * Anything server-only belongs in `$lib/server/` instead — universal `load`
 * functions and components cannot import from there.
 */

/**
 * Public origin of the R2 bucket that holds every olympiad file and icon.
 *
 * Object keys are derived from this prefix and stored *whole* in the database's
 * `url` columns, so deletion works by stripping the prefix back off. Changing
 * this value orphans every existing object — see `docs/data-model.md`.
 */
export const CDN_BASE_URL = 'https://cdn.phoxiv.org';
