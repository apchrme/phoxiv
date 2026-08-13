import uFuzzy from '@leeoniya/ufuzzy';

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
