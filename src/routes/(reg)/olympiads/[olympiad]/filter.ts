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
 * The search, topic and progress filtering behind the olympiad page.
 *
 * Pure functions over the fetched year list, kept out of the component so the
 * rules are readable on their own — the interaction between the topic filter,
 * the progress filter, the text query and the "show full year" toggle is the
 * fiddliest logic on the page.
 *
 * The topic and progress predicates themselves live in
 * [`$lib/filters.ts`](../../../../lib/filters.ts), shared with the ⌘K dialog so
 * the two screens cannot disagree about what "Done" or "Relativity" means. What
 * stays here is everything the *page* adds on top: the text query, the
 * year-versus-problem distinction and the "show full year" toggle, none of which
 * the dialog has.
 *
 * Two of the three filters run over public metadata. The progress filter is the
 * only one that reads per-user data, which is why the {@link ProgressMap} is
 * passed in to the functions that need it rather than living in
 * {@link FilterState} beside the things the user actually chose. It stays a
 * *per-olympiad* map, not the dialog's nested `GlobalProgressMap`: the page has
 * one olympiad and has no business learning the wider type.
 */

/** A year that survived filtering, with the problems that matched. */
export type FilteredYear = YearEntry & { matchedProblems: ProblemEntry[] };

// Re-exported so the page and its children keep importing the status union from
// the module that owns the rest of their filter state, rather than reaching past
// it. The declaration itself moved to `$lib/filters.ts` when the ⌘K dialog
// gained the same control — a `$lib` component cannot import from a route.
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
 * A year's problems that satisfy the topic *and* progress filters — all of them
 * when both are off.
 *
 * One function rather than one per filter, with every caller going through it:
 * that is what stops the rendered list and the "show full year" toggle from
 * disagreeing about what counts as a match.
 */
function visibleProblems(
	year: YearEntry,
	{ topics, status }: FilterState,
	progress: ProgressMap
): ProblemEntry[] {
	// An early return, and not merely an optimisation: with no problem-level
	// filter active this never reads `progress`, so the caller's derived list
	// does not depend on it and marking a problem done doesn't re-filter the
	// whole olympiad.
	if (topics.length === 0 && status === 'all') return year.problems;

	return year.problems.filter(
		(problem) =>
			matchesTopics(problem.topics, topics) &&
			// The key's existence is the completion flag; there is no field to read.
			matchesStatus(progress[progressKey(year.year, problem.number)] !== undefined, status)
	);
}

/**
 * The years to render, in the order given.
 *
 * The topic and progress filters always apply; the text query narrows things
 * further. A year whose *number* matches the query keeps its full problem set,
 * since the user asked for the year rather than for a problem — "full" still
 * meaning the topic- and progress-filtered set, not every problem in the year.
 *
 * `years` may be null while the fetch is in flight.
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

/**
 * True when the query matched a *problem* rather than a year, which is the only
 * situation where the "show full year" toggle does anything.
 */
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
