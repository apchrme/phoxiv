/**
 * Tolerant parsers for the JSON-encoded TEXT columns in D1.
 *
 * SQLite has no array type, so `years.notes`, `years.extraLinks`,
 * `problems.topics` and `user.assignedOlympiads` all store JSON strings. Rows
 * predate several schema revisions and are editable by hand through
 * `wrangler d1 execute`, so a malformed value is a realistic possibility. These
 * parsers degrade to an empty result rather than throwing, which would turn one
 * bad row into a 500 for a whole page.
 */

/** Parses a JSON array of strings; `[]` on anything unexpected. */
export function parseStringArray(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** Parses a JSON array of `{ label, url }` records; `[]` on anything unexpected. */
export function parseLabelledUrls(
	raw: string | null | undefined
): { label: string; url: string }[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(x): x is { label: string; url: string } =>
				typeof x === 'object' &&
				x !== null &&
				typeof x.label === 'string' &&
				typeof x.url === 'string'
		);
	} catch {
		return [];
	}
}
