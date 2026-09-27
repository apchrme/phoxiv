/* Constants needed by both browser and server. Server-only ones go in `$lib/server/`. */

/**
 * Public origin of the R2 bucket. Never change it: the database stores full
 * URLs and deletion strips this prefix to get the key. See docs/data-model.md.
 */
export const CDN_BASE_URL = 'https://cdn.phoxiv.org';

/** Accepted competition years. Here so year inputs can use them for `min`/`max`. */
export const MIN_YEAR = 1900;
/** Leaves room for future competitions. */
export const MAX_YEAR = 2100;
