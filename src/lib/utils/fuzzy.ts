import uFuzzy from '@leeoniya/ufuzzy';

/**
 * Two ways a match is marked, and they are deliberately different.
 *
 * {@link highlight} is for the **problem** index: uFuzzy hands back a marked-up
 * *string*, so the result has to be interpolated with `{@html}`. That is safe
 * only because uFuzzy inserts nothing but `<mark>` around slices of text that
 * came from our own database — short, contributor-typed titles.
 *
 * {@link splitMarks} is for **deep search**, where the text is a PDF's body and
 * that argument does not hold. The server sends plain text plus offsets, this
 * turns them into parts, and the template renders real elements — so the marks go
 * through the compiler and nothing reaches `{@html}` at all.
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

/**
 * `text` with the characters that matched `query` wrapped in `<mark>`.
 *
 * Run per display field rather than over the whole search string, so the marks
 * land on the field the user is actually looking at. The result is interpolated
 * with `{@html}`, which is safe because uFuzzy only ever inserts `<mark>` tags
 * around slices of `text`, and `text` itself comes from our own database.
 */
export function highlight(text: string, query: string): string {
	if (!text || !query) return text;
	const [idxs, info, order] = uf.search([text.toLowerCase()], query.toLowerCase());
	if (!idxs?.length || !order?.length) return text;
	return uFuzzy.highlight(text, info.ranges[order[0]]);
}

/** One slice of a snippet: `marked` says whether it was part of a match. */
export type MarkPart = { text: string; marked: boolean };

/**
 * `text` split into marked and unmarked parts by `[start, end)` offsets.
 *
 * The offsets crossed the wire, so **every range is validated rather than
 * trusted**: anything reversed, out of order, overlapping a range already
 * emitted, or out of bounds is *skipped*. A server-side change must degrade to
 * unmarked text, never to lost or duplicated characters and never to a throw —
 * which is why the cursor only ever moves forward and why the tail is always
 * emitted.
 *
 * Offsets are UTF-16 code units, because `slice` is what consumes them; the
 * server produces them with an indexed walk for the same reason.
 */
export function splitMarks(text: string, ranges: readonly [number, number][]): MarkPart[] {
	const parts: MarkPart[] = [];
	let cursor = 0;

	for (const range of ranges) {
		if (!Array.isArray(range) || range.length !== 2) continue;
		const [rawStart, rawEnd] = range;
		if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) continue;

		// Clamped to the text *and* to the cursor, which is what makes an
		// out-of-order or overlapping range a no-op rather than a duplication.
		const start = Math.max(rawStart, cursor);
		const end = Math.min(rawEnd, text.length);
		if (end <= start) continue;

		if (start > cursor) parts.push({ text: text.slice(cursor, start), marked: false });
		parts.push({ text: text.slice(start, end), marked: true });
		cursor = end;
	}

	if (cursor < text.length) parts.push({ text: text.slice(cursor), marked: false });
	return parts;
}
