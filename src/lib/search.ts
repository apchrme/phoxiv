/**
 * The rules deep (in-file) search obeys, stated once for every side that needs
 * them.
 *
 * Client-safe, and deliberately so — the same
 * `$lib/uploads.ts` versus `$lib/server/uploads.ts` split. Three callers share
 * this module and each would otherwise carry its own copy of a rule:
 *
 * - the ⌘K dialog, which gates on the minimum length and normalises `q` before
 *   it goes on the wire, purely so `?q=Gravitation` and `?q=gravitation ` are one
 *   Cloudflare cache key;
 * - `GET /api/search/files`, which applies the same rules again, so correctness
 *   never depends on the client having applied them;
 * - `$lib/pdf-text.ts` in the browser, `uploadFile` on the server and
 *   `reindex-cli.ts` locally, all of which must normalise extracted text
 *   **identically** or the index and the snippet offsets disagree.
 *
 * The numbers live here and not in `$lib/constants.ts`, which holds
 * `CDN_BASE_URL` and the year range: the endpoint's minimum and the dialog's
 * gate are the *same* rule, not two rules that happen to match, and
 * `DEEP_SEARCH_LIMIT` is what the "showing the N best-matching files" footer
 * reads — the way `MAX_RESULTS` is read straight from `fuzzy.ts` today.
 */

// ── Query bounds ────────────────────────────────────────────────────────────

/** Below this, no D1 read happens at all. A ⌘K box is nothing but prefixes. */
export const MIN_DEEP_QUERY_LENGTH = 3;

/** Refused before D1, and before the cache header goes on. */
export const MAX_DEEP_QUERY_LENGTH = 200;

/**
 * The real cost control. Each token is an index probe ANDed with the rest, so
 * this — rather than the character cap — is what keeps a pathological query
 * inside D1's 30-second ceiling.
 */
export const MAX_DEEP_QUERY_TOKENS = 8;

/** How many file hits a deep search returns. The array order *is* the rank. */
export const DEEP_SEARCH_LIMIT = 20;

/**
 * The first debounce anywhere in this codebase, and it earns it: problem search
 * is a local fuzzy match, this one hits the network per keystroke.
 */
export const DEEP_DEBOUNCE_MS = 250;

/**
 * `q` reduced to its cache-key form: lowercased, whitespace collapsed, trimmed.
 *
 * Lowercasing is free for matching — FTS5's `unicode61` folds case itself — and
 * it is what collapses `Gravitation`, `gravitation` and `gravitation ` onto one
 * edge-cached URL. Applied by the client for that reason and again by the server
 * so nothing depends on the client having done it.
 */
export function normalizeDeepQuery(raw: string): string {
	return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Extraction ──────────────────────────────────────────────────────────────

/**
 * Bumped when the extraction rules change, to re-queue every row with no
 * migration. Stored on each row as `extractor_version`.
 */
export const EXTRACTOR_VERSION = 1;

/** Stored on each row as `engine`, so a mixed corpus is explicable. */
export const EXTRACTOR_ENGINE = 'browser-pdfjs';

/** D1's row/string limit is 2 MB; near-ASCII physics text leaves 4× headroom. */
export const TEXT_CHAR_CAP = 512_000;

/**
 * Under this many characters, the extraction is reported as `empty` rather than
 * `ok` — which in practice means **a scanned PDF**. A first-class, visible state,
 * not a failure.
 */
export const MIN_EXTRACTED_CHARS = 32;

/**
 * The server's hard gate on the client-submitted `extractedText` field.
 *
 * Well above {@link TEXT_CHAR_CAP}, so a browser that followed the rules is
 * never near it, and well under D1's 2 MB row limit. Anything larger lands as
 * `pending` for the backfill sweep instead of being stored.
 */
export const MAX_SUBMITTED_TEXT_CHARS = 1_000_000;

/**
 * Extracted document text, normalised for the index.
 *
 * **The order of these steps is load-bearing**, and each one earns its place:
 *
 * 1. `NFKC` folds ligatures (`ﬁ` → `fi`) and full-width forms. One line for the
 *    classic PDF ligature bug, which otherwise leaves `find` unfindable.
 * 2. De-hyphenate line-broken words, **before** newlines collapse — after the
 *    collapse there is no newline left to key on. Lowercase→lowercase only, so
 *    `X-\nray` fares better than a blanket rule would. It is a heuristic and it
 *    will occasionally glue a genuine compound back together; that is the
 *    accepted trade for the far commoner justified-text case.
 * 3. Strip control and zero-width characters. **Load-bearing for snippet safety
 *    and for trust**: this is what guarantees the U+0002/U+0003 snippet
 *    sentinels cannot occur in stored text, forged or otherwise. `\t`, `\n` and
 *    `\r` are deliberately spared here so step 4 still sees word boundaries —
 *    removing them outright would glue the last word of one line to the first of
 *    the next.
 * 4. Collapse whitespace and trim.
 *
 * Two things it deliberately does **not** do:
 *
 * - **It does not lowercase.** `unicode61` folds case for matching, and the
 *   snippet should show real case. Note the contrast with `getSearchIndex`,
 *   which *does* lowercase because uFuzzy matches the raw string — so nobody
 *   should "fix" the inconsistency.
 * - **It does not strip math.** `\alpha` indexes as the token `alpha`, which is
 *   useful.
 *
 * There is no markdown-stripping step: pdf.js yields text items, not markdown,
 * which deleted a whole class of normalisation.
 */
export function normalizeExtracted(raw: string): string {
	return (
		raw
			.normalize('NFKC')
			.replace(/(\p{Ll})-\n(\p{Ll})/gu, '$1$2')
			// C0 and C1 controls, keeping \t \n \r for the collapse below.
			// eslint-disable-next-line no-control-regex -- stripping control characters is the entire point of this line, and it is what makes the snippet sentinels unforgeable
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
			// Soft hyphen, zero-width and bidi marks. These survive `\s`, so they
			// would otherwise split a word in the middle as far as the tokenizer is
			// concerned.
			.replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/** Text and whether it was cut short, after applying {@link TEXT_CHAR_CAP}. */
export type CappedText = { text: string; truncated: boolean };

/**
 * `text` cut to {@link TEXT_CHAR_CAP} on a whitespace boundary.
 *
 * The boundary matters: cutting mid-word would put a spurious half-token into
 * the index, which a prefix query would then match. `truncated` travels with it
 * so a thin match set on a very long document is explicable rather than a
 * mystery.
 */
export function capExtracted(text: string): CappedText {
	if (text.length <= TEXT_CHAR_CAP) return { text, truncated: false };
	const cut = text.slice(0, TEXT_CHAR_CAP);
	const boundary = cut.lastIndexOf(' ');
	// `> TEXT_CHAR_CAP / 2` guards the pathological no-whitespace document, where
	// backing up to the last space would throw away almost everything.
	return { text: boundary > TEXT_CHAR_CAP / 2 ? cut.slice(0, boundary) : cut, truncated: true };
}
