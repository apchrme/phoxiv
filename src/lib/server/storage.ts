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

/**
 * The half-open `[lo, hi)` range of CDN urls belonging to one olympiad.
 *
 * The reverse of {@link fileKey}'s first two segments, and it lives here beside
 * the forward derivation on purpose: CLAUDE.md rule 3 freezes the key layout,
 * and colocating the two forces a future change to touch both. Deep search's
 * olympiad filter is the only caller — it scopes the ranking pass with a range
 * over `file_text.url` rather than a join, because that is the only form
 * costing no extra D1 rows. See `docs/search.md`.
 *
 * Correctness rests entirely on {@link fileKey}:
 * `olympiads/<olympiadId>/<year>[/<problemNumber>]/<slug>.<ext>`. Both file
 * levels sit under `olympiads/<id>/`, and icons live under `icons/olympiads/…`
 * and never enter the text index. The trailing `/` in `lo` is what stops `ipho`
 * matching `iphox`: every character an id may continue with sorts above `/`
 * (0x2F), so a longer id can never fall inside a shorter one's range. `url` is
 * plain `text()` under SQLite's default BINARY collation — there is no
 * `COLLATE NOCASE` anywhere in `schema.ts` — so the comparison is byte-wise and
 * exact.
 */
export function olympiadUrlRange(olympiadId: string): { lo: string; hi: string } {
	const lo = `${CDN_BASE_URL}/olympiads/${olympiadId}/`;
	// `hi` is `lo`'s immediate successor, so `[lo, hi)` is exactly "the urls
	// beginning with `lo`". Written out rather than expressed as `LIKE 'lo%'`
	// because only a range stays a range: `LIKE` is not usable as an index bound
	// unless the collation and the pattern both cooperate, and a prefix with no
	// wildcard is what makes this an ordered scan the planner can reason about.
	const hi = lo.slice(0, -1) + String.fromCharCode(lo.charCodeAt(lo.length - 1) + 1);
	return { lo, hi };
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

/**
 * Re-exported so the `<slugLabel>` half of `fileKey` stays discoverable here,
 * next to the layout it feeds. It is defined in `$lib/uploads.ts` rather than in
 * this module because the year editor has to apply the same slug in the browser
 * to warn about a collision, and `$lib/server/` cannot be imported client-side.
 */
export { slugifyLabel } from '$lib/uploads';
