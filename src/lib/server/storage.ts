import { CDN_BASE_URL } from '$lib/constants';

/*
 * R2 access and the object key layout.
 *
 * Never change the key layout, `CDN_BASE_URL` or `slugifyLabel`. The database
 * stores full CDN URLs, and deletion gets the key back by stripping the prefix,
 * so a change orphans every object and breaks deletion. See docs/data-model.md.
 */

/** Shown to the user when the R2 binding is missing. */
export const STORAGE_UNAVAILABLE = 'Storage unavailable';

/**
 * The R2 bucket, or `null` when the binding is absent. Doesn't throw, so actions
 * can `actionFail()` instead of losing the user's input to `error()`.
 */
export function getBucket(platform: App.Platform | undefined): R2Bucket | null {
	return platform?.env.FILES ?? null;
}

/** The public URL an object with `key` is served from. */
export function cdnUrl(key: string): string {
	return `${CDN_BASE_URL}/${key}`;
}

/** The object key behind a CDN `url`, or `null` if it isn't one of ours. */
export function keyFromCdnUrl(url: string): string | null {
	const prefix = `${CDN_BASE_URL}/`;
	return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/**
 * The `[lo, hi)` range of CDN urls for one olympiad's files, used by deep
 * search's olympiad filter. It inverts {@link fileKey}, so keep the two together.
 *
 * The trailing `/` in `lo` stops `ipho` from matching `iphox`. The comparison is
 * byte-wise because `url` uses SQLite's default BINARY collation.
 */
export function olympiadUrlRange(olympiadId: string): { lo: string; hi: string } {
	const lo = `${CDN_BASE_URL}/olympiads/${olympiadId}/`;
	// `lo` with its last character incremented: `[lo, hi)` is every url starting
	// with `lo`. A range, not `LIKE 'lo%'`, so SQLite can use the index.
	const hi = lo.slice(0, -1) + String.fromCharCode(lo.charCodeAt(lo.length - 1) + 1);
	return { lo, hi };
}

/** Key for an olympiad's icon. One per olympiad, replaced in place. */
export function iconKey(olympiadId: string, ext: string): string {
	return `icons/olympiads/${olympiadId}.${ext}`;
}

/**
 * Key for a year or problem file:
 * `olympiads/<olympiadId>/<year>[/<problemNumber>]/<slug>.<ext>`.
 */
export function fileKey(
	olympiadId: string,
	year: string | number,
	slugLabel: string,
	ext: string,
	problemNumber?: string
): string {
	const base = `olympiads/${olympiadId}/${year}`;
	const dir = problemNumber ? `${base}/${problemNumber}` : base;
	return `${dir}/${slugLabel}.${ext}`;
}

/**
 * Deletes the object behind a stored CDN `url`. No-ops for foreign URLs.
 * Only pass URLs read from the database, never client input, or a crafted value
 * could delete any object.
 */
export async function deleteByUrl(bucket: R2Bucket, url: string): Promise<void> {
	const key = keyFromCdnUrl(url);
	if (key) await bucket.delete(key);
}

/**
 * Deletes many objects, ignoring failures, so a missing object never blocks
 * deleting the database rows.
 */
export async function deleteByUrls(bucket: R2Bucket, urls: string[]): Promise<void> {
	await Promise.all(urls.map((url) => deleteByUrl(bucket, url).catch(() => {})));
}

/**
 * Removes an olympiad's icons in every extension except `keepExt`, so a new
 * `.png` doesn't leave an old `.svg` on the CDN.
 */
export async function deleteStaleIcons(
	bucket: R2Bucket,
	olympiadId: string,
	keepExt: string,
	allExts: readonly string[]
): Promise<void> {
	await Promise.all(
		allExts
			.filter((ext) => ext !== keepExt)
			.map((ext) => bucket.delete(iconKey(olympiadId, ext)).catch(() => {}))
	);
}

export { CDN_BASE_URL };

// Defined in `$lib/uploads.ts` because the browser needs it too (collision
// warnings); re-exported here next to the key layout it feeds.
export { slugifyLabel } from '$lib/uploads';
