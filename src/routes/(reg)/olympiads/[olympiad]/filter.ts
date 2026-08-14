import type { ProblemEntry, ProblemTopic, YearEntry } from '$lib/types';

/**
 * The search and topic filtering behind the olympiad page.
 *
 * Pure functions over the fetched year list, kept out of the component so the
 * rules are readable on their own — the interaction between the topic filter,
 * the text query and the "show full year" toggle is the fiddliest logic on the
 * page.
 */

/** A year that survived filtering, with the problems that matched. */
export type FilteredYear = YearEntry & { matchedProblems: ProblemEntry[] };

export type FilterState = {
	query: string;
	topics: ProblemTopic[];
	/** Show a matching year's whole problem set, not just the matches. */
	showFullYear: boolean;
};

function matchesQuery(problem: ProblemEntry, q: string): boolean {
	return (
		problem.number.toLowerCase().includes(q) || (problem.title?.toLowerCase().includes(q) ?? false)
	);
}

/** A year's problems that satisfy the topic filter — all of them when it's off. */
function topicMatches(year: YearEntry, topics: ProblemTopic[]): ProblemEntry[] {
	if (topics.length === 0) return year.problems;
	return year.problems.filter((p) => p.topics?.some((t) => topics.includes(t)) ?? false);
}

/**
 * The years to render, in the order given.
 *
 * The topic filter always applies; the text query narrows things further. A year
 * whose *number* matches the query keeps its full problem set, since the user
 * asked for the year rather than for a problem.
 *
 * `years` may be null while the fetch is in flight.
 */
export function filterYears(
	years: YearEntry[] | null,
	{ query, topics, showFullYear }: FilterState
): FilteredYear[] {
	const q = query.trim().toLowerCase();
	const results: FilteredYear[] = [];

	for (const year of years ?? []) {
		const inTopics = topicMatches(year, topics);
		if (topics.length > 0 && inTopics.length === 0) continue;

		if (!q) {
			results.push({ ...year, matchedProblems: inTopics });
			continue;
		}

		if (String(year.year).includes(q)) {
			results.push({ ...year, matchedProblems: inTopics });
			continue;
		}

		const queryMatched = inTopics.filter((p) => matchesQuery(p, q));
		if (queryMatched.length > 0) {
			results.push({ ...year, matchedProblems: showFullYear ? inTopics : queryMatched });
		}
	}

	return results;
}

/**
 * True when the query matched a *problem* rather than a year, which is the only
 * situation where the "show full year" toggle does anything.
 */
export function hasProblemMatches(
	years: YearEntry[] | null,
	{ query, topics }: FilterState
): boolean {
	const q = query.trim().toLowerCase();
	if (!q) return false;
	return (years ?? []).some(
		(y) => !String(y.year).includes(q) && topicMatches(y, topics).some((p) => matchesQuery(p, q))
	);
}

/**
 * Whether to show a year's own notes, links and files.
 *
 * Hidden when the user is searching for a problem, since year-level material
 * isn't what they asked for — unless they turned "show full year" on.
 */
export function showYearLevel(year: YearEntry, { query, showFullYear }: FilterState): boolean {
	const q = query.trim().toLowerCase();
	return !q || String(year.year).includes(q) || showFullYear;
}

/** True when the year has any year-level material worth a section. */
export function hasYearLevelContent(year: YearEntry): boolean {
	return year.yearFiles.length > 0 || year.notes.length > 0 || year.extraLinks.length > 0;
}
