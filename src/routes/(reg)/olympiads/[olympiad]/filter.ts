import type { ProblemEntry, YearEntry } from '$lib/types';
import { progressKey, type ProgressMap } from '$lib/progress';
import {
	isFiltering,
	matchesStatus,
	matchesTopics,
	type ProblemFilter,
	type ProblemStatus
} from '$lib/filters';

/**
 * Search, topic and progress filtering for the olympiad page, as pure functions.
 *
 * The topic and progress predicates live in `$lib/filters.ts`, shared with the
 * ⌘K dialog so both agree. This file adds the page-only parts: the text query,
 * year-versus-problem matches, and "show full year".
 *
 * `progress` is per-user, so it is passed separately rather than kept in
 * {@link FilterState}.
 */

/** A year that survived filtering, with the problems that matched. */
export type FilteredYear = YearEntry & { matchedProblems: ProblemEntry[] };

// Re-exported so the page imports all its filter types from here.
export type { ProblemStatus };

export type FilterState = ProblemFilter & {
	query: string;
	/** Show a matching year's whole problem set, not just the matches. */
	showFullYear: boolean;
};

function matchesQuery(problem: ProblemEntry, q: string): boolean {
	return (
		problem.number.toLowerCase().includes(q) || (problem.title?.toLowerCase().includes(q) ?? false)
	);
}

/**
 * A year's problems passing the topic and progress filters. Every caller goes
 * through this, so the list and the "show full year" toggle agree.
 */
function visibleProblems(
	year: YearEntry,
	{ topics, status }: FilterState,
	progress: ProgressMap
): ProblemEntry[] {
	// Returning before reading `progress` keeps the page's derived list from
	// depending on it, so tracking a problem doesn't re-filter everything.
	if (topics.length === 0 && status === 'all') return year.problems;

	return year.problems.filter(
		(problem) =>
			matchesTopics(problem.topics, topics) &&
			// A key existing means completed.
			matchesStatus(progress[progressKey(year.year, problem.number)] !== undefined, status)
	);
}

/**
 * The years to render. Topic and progress filters always apply; the query
 * narrows further. A year whose number matches keeps all its (filtered)
 * problems. `years` is null while loading.
 */
export function filterYears(
	years: YearEntry[] | null,
	state: FilterState,
	progress: ProgressMap
): FilteredYear[] {
	const { query, showFullYear } = state;
	const q = query.trim().toLowerCase();
	const results: FilteredYear[] = [];

	for (const year of years ?? []) {
		const visible = visibleProblems(year, state, progress);
		if (isFiltering(state) && visible.length === 0) continue;

		if (!q) {
			results.push({ ...year, matchedProblems: visible });
			continue;
		}

		if (String(year.year).includes(q)) {
			results.push({ ...year, matchedProblems: visible });
			continue;
		}

		const queryMatched = visible.filter((p) => matchesQuery(p, q));
		if (queryMatched.length > 0) {
			results.push({ ...year, matchedProblems: showFullYear ? visible : queryMatched });
		}
	}

	return results;
}

/** True when the query matched a problem, not a year. Only then does "show full year" matter. */
export function hasProblemMatches(
	years: YearEntry[] | null,
	state: FilterState,
	progress: ProgressMap
): boolean {
	const q = state.query.trim().toLowerCase();
	if (!q) return false;
	return (years ?? []).some(
		(y) =>
			!String(y.year).includes(q) &&
			visibleProblems(y, state, progress).some((p) => matchesQuery(p, q))
	);
}

/** Whether to show a year's notes, links and files: hidden when searching for a problem. */
export function showYearLevel(year: YearEntry, { query, showFullYear }: FilterState): boolean {
	const q = query.trim().toLowerCase();
	return !q || String(year.year).includes(q) || showFullYear;
}

/** True when the year has any year-level material worth a section. */
export function hasYearLevelContent(year: YearEntry): boolean {
	return year.yearFiles.length > 0 || year.notes.length > 0 || year.extraLinks.length > 0;
}
