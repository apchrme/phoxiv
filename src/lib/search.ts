/**
 * Shared rules for deep (in-file) search. Client-safe, because three sides need
 * the same rules:
 *
 * - the ⌘K dialog normalises `q` before sending it, so equivalent queries share
 *   one Cloudflare cache key;
 * - `GET /api/search/files` applies the same rules again, so correctness never
 *   depends on the client;
 * - `$lib/pdf-text.ts`, `uploadFile` and `reindex-cli.ts` must normalise
 *   extracted text identically, or the index and snippet offsets disagree.
 */

// ── Query bounds ────────────────────────────────────────────────────────────

/** Below this, no D1 read happens at all. A ⌘K box is nothing but prefixes. */
export const MIN_DEEP_QUERY_LENGTH = 5;

/** Refused before D1, and before the cache header goes on. */
export const MAX_DEEP_QUERY_LENGTH = 200;

/**
 * Token cap on the AND and OR rungs of `sanitizeFtsQuery`. Each token is one more
 * index probe, so this (not the character cap) keeps a pathological query inside
 * D1's 30-second limit. It can be this high because the OR rung recovers from
 * over-constrained ANDs.
 */
export const MAX_DEEP_QUERY_TOKENS = 24;

/**
 * Token cap on the phrase rung. Looser than {@link MAX_DEEP_QUERY_TOKENS}
 * because a longer phrase matches fewer documents. Rarely reached, since
 * {@link MAX_DEEP_QUERY_LENGTH} already bounds the query.
 */
export const MAX_PHRASE_TOKENS = 32;

/** How many file hits a deep search returns. The array order is the rank. */
export const DEEP_SEARCH_LIMIT = 20;

/** Deep search hits the network per keystroke, unlike the local problem search. */
export const DEEP_DEBOUNCE_MS = 250;

/**
 * `q` in its cache-key form: lowercased, whitespace collapsed, trimmed.
 * Lowercasing costs nothing because unicode61 folds case anyway. Applied by the
 * client for the cache key and again by the server.
 */
export function normalizeDeepQuery(raw: string): string {
	return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}
/**
 * The olympiad filter in its cache-key form: `null` when absent or empty, so
 * `?q=x` and `?q=x&olympiad=` are one cache key. Lowercased because ids are.
 * Applied by the client and again by the server.
 */
export function normalizeOlympiadFilter(raw: string | null): string | null {
	const id = (raw ?? '').trim().toLowerCase();
	return id === '' ? null : id;
}

/**
 * Whether an olympiad filter is shaped like an id. Not a lookup in the table: an
 * unknown id just returns no results, and checking would add a read to every
 * filtered search.
 *
 * Its purpose is bounding the cache key space. It is not an injection defence
 * (the value is a bound parameter). A malformed value gets a 400, which is not
 * cached.
 *
 * `createOlympiad` does not restrict its slug charset, so keep this pattern in
 * step with the ids it can produce, or a new olympiad becomes unfilterable.
 */
export function isOlympiadFilter(id: string): boolean {
	return /^[a-z0-9][a-z0-9-]{0,31}$/.test(id);
}

// ── Extraction ──────────────────────────────────────────────────────────────

/**
 * Bump when the extraction rules change: every older row re-enters the backfill
 * queue, with no migration. Stored on each row as `extractor_version`.
 */
export const EXTRACTOR_VERSION = 1;

/** Stored on each row as `engine`, so a mixed corpus is explicable. */
export const EXTRACTOR_ENGINE = 'browser-pdfjs';

/** D1's row/string limit is 2 MB; near-ASCII physics text leaves 4× headroom. */
export const TEXT_CHAR_CAP = 512_000;

/** Below this many characters an extraction is `empty`, usually a scanned PDF. */
export const MIN_EXTRACTED_CHARS = 32;

/**
 * The server's hard limit on the client-submitted `extractedText` field. Well
 * above {@link TEXT_CHAR_CAP} and well under D1's 2 MB row limit. Anything larger
 * is stored as `pending` for the backfill instead.
 */
export const MAX_SUBMITTED_TEXT_CHARS = 1_000_000;

/**
 * Extracted document text, normalised for the index. The order matters:
 *
 * 1. NFKC folds ligatures (`ﬁ` → `fi`) and full-width forms.
 * 2. Re-join words hyphenated across a line break. Must run before newlines
 *    collapse. Lowercase-to-lowercase only.
 * 3. Strip control and zero-width characters. This guarantees the STX/ETX
 *    snippet sentinels can never occur in stored text. `\t \n \r` are kept so
 *    step 4 still sees word boundaries.
 * 4. Collapse whitespace and trim.
 *
 * It does not lowercase (unicode61 folds case, and snippets should show real
 * case) and does not strip math (`\alpha` indexes as `alpha`).
 */
export function normalizeExtracted(raw: string): string {
	return (
		raw
			.normalize('NFKC')
			.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
			// C0 and C1 controls, keeping \t \n \r for the collapse below.
			// eslint-disable-next-line no-control-regex -- stripping control characters is the entire point of this line, and it is what makes the snippet sentinels unforgeable
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
			// Soft hyphen, zero-width and bidi marks. `\s` doesn't match them, so
			// left in they would split a word for the tokenizer.
			.replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/** Text and whether it was cut short, after applying {@link TEXT_CHAR_CAP}. */
export type CappedText = { text: string; truncated: boolean };

/**
 * `text` cut to {@link TEXT_CHAR_CAP} on a whitespace boundary, so no half-word
 * enters the index for a prefix query to match.
 */
export function capExtracted(text: string): CappedText {
	if (text.length <= TEXT_CHAR_CAP) return { text, truncated: false };
	const cut = text.slice(0, TEXT_CHAR_CAP);
	const boundary = cut.lastIndexOf(' ');
	// Guards a document with no whitespace, where backing up to the last space
	// would throw away almost everything.
	return { text: boundary > TEXT_CHAR_CAP / 2 ? cut.slice(0, boundary) : cut, truncated: true };
}
