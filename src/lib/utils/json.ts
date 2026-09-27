/*
 * Parsers for the JSON TEXT columns (`years.notes`, `years.extraLinks`,
 * `problems.topics`, `user.assignedOlympiads`). Rows can be old or hand-edited,
 * so bad values return `[]` instead of throwing and failing the whole page.
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
