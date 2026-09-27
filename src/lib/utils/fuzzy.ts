import uFuzzy from '@leeoniya/ufuzzy';

/*
 * Two ways a match is marked:
 *
 * - {@link highlight} (problem search) returns HTML for `{@html}`. It is safe
 *   because it escapes every slice itself. Titles are contributor-typed, so
 *   "it came from our database" is not a reason.
 * - {@link splitMarks} (deep search) turns server offsets into parts that the
 *   template renders as real elements. Nothing reaches `{@html}`.
 */

/**
 * Fuzzy search over the global problem index. Allows one inserted character
 * per term, enough to absorb a typo without matching everything.
 */
const uf = new uFuzzy({ intraMode: 1, intraIns: 1 });

/** How many hits `rank` will return before truncating. */
export const MAX_RESULTS = 50;

/**
 * The items whose `haystack[i]` best match `query`, most relevant first.
 * Capped at `limit`; returns `[]` for an empty query or no match.
 *
 * `haystack` is indexed in parallel with `items`.
 */
export function rank<T>(
	items: readonly T[],
	haystack: readonly string[],
	query: string,
	limit = MAX_RESULTS
): T[] {
	const q = query.trim();
	if (!q) return [];
	const [idxs, , order] = uf.search(haystack as string[], q.toLowerCase());
	if (!idxs?.length || !order?.length) return [];
	return order.slice(0, limit).map((oi) => items[idxs[oi]]);
}

/** The characters that can break out of HTML text or an attribute value. */
const HTML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;'
};

/**
 * `text` with every character in {@link HTML_ESCAPES} replaced by its entity.
 * One pass, so there is no ordering bug (chained replaces must do `&` first).
 */
function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * uFuzzy's `mark` callback: escape the slice, then wrap it if it matched.
 * Escape here, not before the call: the ranges index the unescaped string.
 */
const markEscaped = (part: string, matched: boolean) =>
	matched ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part);

/**
 * `text`, HTML-escaped, with the characters that matched `query` wrapped in
 * `<mark>`. Run per display field so marks land on the field the user sees.
 *
 * Every return path escapes, including the no-match and empty-query paths,
 * because those still deliver the field to `{@html}`. This function is the only
 * thing between a contributor-typed title and the DOM, and `/api/search` is
 * shared-cached for a day.
 *
 * Known cosmetic issue: uFuzzy matches against `text.toLowerCase()`, which is
 * not length-preserving for every Unicode character, so a mark can be off by one.
 */
export function highlight(text: string, query: string): string {
	if (!text) return '';
	if (!query) return escapeHtml(text);
	const [idxs, info, order] = uf.search([text.toLowerCase()], query.toLowerCase());
	if (!idxs?.length || !order?.length) return escapeHtml(text);
	return uFuzzy.highlight(text, info.ranges[order[0]], markEscaped);
}

/** One slice of a snippet: `marked` says whether it was part of a match. */
export type MarkPart = { text: string; marked: boolean };

/**
 * `text` split into marked and unmarked parts by `[start, end)` offsets.
 *
 * The offsets came over the wire, so every range is validated. Reversed,
 * out-of-order, overlapping or out-of-bounds ranges are skipped. Bad input must
 * degrade to unmarked text, never to lost or duplicated characters or a throw.
 *
 * Offsets are UTF-16 code units, since `slice` consumes them.
 */
export function splitMarks(text: string, ranges: readonly [number, number][]): MarkPart[] {
	// This runs inside a `$derived`, where a throw would take down the whole
	// result list, so check the containers too.
	if (typeof text !== 'string') return [];
	if (!Array.isArray(ranges)) return [{ text, marked: false }];

	const parts: MarkPart[] = [];
	let cursor = 0;

	for (const range of ranges) {
		if (!Array.isArray(range) || range.length !== 2) continue;
		const [rawStart, rawEnd] = range;
		if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) continue;

		// Reject a bad start, don't clamp it: a clamped range would still mark
		// characters it shouldn't. This also keeps the cursor moving forward and
		// rejects negative starts.
		if (rawStart < cursor || rawStart > text.length) continue;

		// Clamping the end is fine: shortening a range can only unmark.
		const end = Math.min(rawEnd, text.length);
		if (end <= rawStart) continue;

		if (rawStart > cursor) parts.push({ text: text.slice(cursor, rawStart), marked: false });
		parts.push({ text: text.slice(rawStart, end), marked: true });
		cursor = end;
	}

	if (cursor < text.length) parts.push({ text: text.slice(cursor), marked: false });
	return parts;
}
