import { CDN_BASE_URL } from '$lib/constants';

/**
 * Every read and write against the R2 bucket, and the key layout it uses.
 *
 * The key layout is the highest-risk string in the codebase. Keys are not
 * stored anywhere: the database keeps the *full CDN URL* in its `url` columns,
 * and deletion recovers the key by stripping the `CDN_BASE_URL` prefix back
 * off. Changing the layout or `slugifyLabel` orphans every existing object and
 * simultaneously breaks deletion. See `docs/data-model.md`.
 */

/** Shown to the user when the R2 binding is missing. */
export const STORAGE_UNAVAILABLE = 'Storage unavailable';

/**
 * The R2 bucket, or `null` when the binding is absent.
 *
 * Returns `null` rather than throwing so callers inside form actions can
 * `fail()` and surface a toast; a thrown `error()` would replace the whole page
 * with the error template mid-edit.
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

/** Key for an olympiad's icon. One per olympiad, replaced in place. */
export function iconKey(olympiadId: string, ext: string): string {
	return `icons/olympiads/${olympiadId}.${ext}`;
}

/**
 * Key for a year-level or problem-level document.
 *
 * Problem files nest one level deeper than year files, under the problem number.
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
 * A file label reduced to a safe key segment.
 *
 * Must stay byte-identical to what produced the keys already in the bucket —
 * a change here means existing objects can no longer be located.
 */
export function slugifyLabel(label: string): string {
	return label
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '');
}

/**
 * Deletes the object behind a stored CDN `url`. No-ops for foreign URLs.
 *
 * Always pass the URL read back from the database, never one submitted by the
 * client, or a crafted value could delete an arbitrary object.
 */
export async function deleteByUrl(bucket: R2Bucket, url: string): Promise<void> {
	const key = keyFromCdnUrl(url);
	if (key) await bucket.delete(key);
}

/**
 * Deletes many objects concurrently, ignoring individual failures.
 *
 * Used when removing a year, where a missing object must not block the
 * database rows from being deleted — the alternative is a row that can never be
 * removed.
 */
export async function deleteByUrls(bucket: R2Bucket, urls: string[]): Promise<void> {
	await Promise.all(urls.map((url) => deleteByUrl(bucket, url).catch(() => {})));
}

/**
 * Removes an olympiad's icons in every extension *except* `keepExt`.
 *
 * Icons are keyed by extension, so uploading a `.png` over an existing `.svg`
 * would otherwise leave the old file behind, still served from the CDN.
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
