import uFuzzy from '@leeoniya/ufuzzy';

/**
 * Two ways a match is marked, and they are deliberately different.
 *
 * {@link highlight} is for the **problem** index: uFuzzy hands back a marked-up
 * *string*, so the result has to be interpolated with `{@html}`. It is safe
 * because `highlight` HTML-escapes every slice of `text` itself and only then
 * wraps the matched ones — the `<mark>` tags it adds are the only markup in what
 * it returns. "It came from our own database" is **not** what makes it safe: the
 * titles in there are typed by contributors, who are not admins.
 *
 * {@link splitMarks} is for **deep search**, where the text is a PDF's body.
 * Escaping is not what saves that one — the server sends plain text plus offsets,
 * this turns them into parts, and the template renders real elements, so the
 * marks go through the compiler and nothing reaches `{@html}` at all.
 */

/**
 * Fuzzy search over the global problem index.
 *
 * One shared uFuzzy instance, configured to allow a single inserted character
 * within a term (`intraMode: 1`, `intraIns: 1`) — enough to absorb a typo
 * without matching everything.
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
 *
 * One pass over a character class with a lookup, rather than five chained
 * `replace` calls: a chain is only correct if `&` goes first, or the later steps
 * re-escape the ampersands the earlier ones just introduced. A single pass cannot
 * get that order wrong.
 */
function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * uFuzzy's `mark` callback: escape the slice, then wrap it if it matched.
 *
 * Escaping belongs *here*, inside uFuzzy's own walk, rather than before the call:
 * the ranges index the unescaped string, so escaping first would shift every
 * offset past the first `&`.
 */
const markEscaped = (part: string, matched: boolean) =>
	matched ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part);

/**
 * `text`, HTML-escaped, with the characters that matched `query` wrapped in
 * `<mark>`.
 *
 * Run per display field rather than over the whole search string, so the marks
 * land on the field the user is actually looking at.
 *
 * # Why the `{@html}` at the call site is safe
 *
 * **Every slice is escaped**, on all three paths — and the two that mark nothing
 * matter as much as the one that does, because they are what carries a field to
 * the DOM unchanged:
 *
 * | Path           | Returns                   | Rendered when                             |
 * | -------------- | ------------------------- | ----------------------------------------- |
 * | uFuzzy matched | escaped slices + `<mark>` | this field matched the typed query         |
 * | no match       | the whole field, escaped  | another field matched and this one did not |
 * | empty `query`  | the whole field, escaped  | a topic or status filter lists the pool    |
 *
 * A field therefore never has to match anything to be delivered, and
 * `/api/search` sits in Cloudflare's shared cache for a day. The fields are
 * contributor-typed — `sanitize-html` runs only over olympiad descriptions, on
 * the server — so this function is the only thing between a title and the DOM.
 *
 * uFuzzy computes the ranges against `text.toLowerCase()`, which is not
 * length-preserving for every Unicode case pair, so on such a title a mark can
 * land a character out. Pre-existing, cosmetic, and independent of the escaping.
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
 * The offsets crossed the wire, so **every range is validated rather than
 * trusted**: anything reversed, out of order, overlapping a range already
 * emitted, or out of bounds is *skipped* — as is a `ranges` that is not an array
 * at all. A server-side change must degrade to unmarked text, never to lost or
 * duplicated characters and never to a throw — which is why the cursor only ever
 * moves forward and why the tail is always emitted.
 *
 * Offsets are UTF-16 code units, because `slice` is what consumes them; the
 * server produces them with an indexed walk for the same reason.
 */
export function splitMarks(text: string, ranges: readonly [number, number][]): MarkPart[] {
	// The container is checked as carefully as its contents, because both crossed
	// the same wire. `for (const range of undefined)` throws, and this runs inside
	// a `$derived`, where a throw takes down the entire result list rather than the
	// one snippet — the opposite of degrading to unmarked text.
	if (typeof text !== 'string') return [];
	if (!Array.isArray(ranges)) return [{ text, marked: false }];

	const parts: MarkPart[] = [];
	let cursor = 0;

	for (const range of ranges) {
		if (!Array.isArray(range) || range.length !== 2) continue;
		const [rawStart, rawEnd] = range;
		if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) continue;

		// **A bad start is rejected, never repaired**, which is what the docstring
		// promises and what clamping it forward to the cursor quietly failed to do:
		// the clamp looks like a no-op for an overlapping or out-of-order range, but
		// whatever survives it still gets marked, so a range that failed validation
		// still colours characters as "this is what you searched for". A range we
		// cannot trust must mark nothing. Accepting only a start at or after the
		// cursor is also what keeps the cursor moving forward, and it rejects a
		// negative start for free, the cursor starting at 0.
		if (rawStart < cursor || rawStart > text.length) continue;

		// The end is the one bound still clamped, and only downwards: shortening a
		// range can only *unmark* characters, and `slice` would stop at
		// `text.length` regardless. Moving a start repairs a range into one that
		// still marks; trimming an end cannot.
		const end = Math.min(rawEnd, text.length);
		if (end <= rawStart) continue;

		if (rawStart > cursor) parts.push({ text: text.slice(cursor, rawStart), marked: false });
		parts.push({ text: text.slice(rawStart, end), marked: true });
		cursor = end;
	}

	if (cursor < text.length) parts.push({ text: text.slice(cursor), marked: false });
	return parts;
}
