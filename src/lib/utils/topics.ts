import { PROBLEM_TOPICS, type ProblemTopic } from '$lib/types.js';

/** Lookup of lowercased topic name -> canonical topic, for case-insensitive input. */
const BY_LOWER_NAME = new Map<string, ProblemTopic>(
	PROBLEM_TOPICS.map((t) => [t.toLowerCase(), t])
);

/** Narrows an arbitrary string to a known topic, ignoring case and surrounding space. */
export function normalizeTopic(raw: string): ProblemTopic | null {
	return BY_LOWER_NAME.get(raw.trim().toLowerCase()) ?? null;
}

/**
 * Keeps only recognised topics, in the canonical `PROBLEM_TOPICS` order, without
 * duplicates. Unknown values are dropped rather than rejected so that renaming a
 * topic later can't break existing rows.
 */
export function sanitizeTopics(raw: readonly string[]): ProblemTopic[] {
	const found = new Set<ProblemTopic>();
	for (const value of raw) {
		const topic = normalizeTopic(value);
		if (topic) found.add(topic);
	}
	return PROBLEM_TOPICS.filter((t) => found.has(t));
}

/**
 * Parses the JSON array stored in `problems.topics`. Tolerates malformed values
 * by falling back to an empty list — same defensive convention as the other
 * JSON-encoded columns in this schema.
 */
export function parseTopics(stored: string | null | undefined): ProblemTopic[] {
	if (!stored) return [];
	try {
		const parsed: unknown = JSON.parse(stored);
		if (!Array.isArray(parsed)) return [];
		return sanitizeTopics(parsed.filter((v): v is string => typeof v === 'string'));
	} catch {
		return [];
	}
}

/** Serialises topics for storage in `problems.topics`. */
export function serializeTopics(topics: readonly string[]): string {
	return JSON.stringify(sanitizeTopics(topics));
}

/**
 * Topics in a CSV cell are separated by semicolons, since commas are the CSV
 * delimiter itself (e.g. `Mechanics;Waves and Optics`).
 */
export const CSV_TOPIC_SEPARATOR = ';';

export function parseTopicsCsvCell(cell: string | null | undefined): ProblemTopic[] {
	if (!cell) return [];
	return sanitizeTopics(cell.split(CSV_TOPIC_SEPARATOR));
}

export function formatTopicsCsvCell(topics: readonly ProblemTopic[]): string {
	return topics.join(CSV_TOPIC_SEPARATOR);
}
