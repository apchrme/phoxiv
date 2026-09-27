import type { ProblemTopic, SearchItem } from '$lib/types';
import { progressKey, type GlobalProgressMap } from '$lib/progress';

/*
 * Filter predicates shared by the olympiad page toolbar, the search dialog and
 * `OlympiadPicker`, so they all agree on what matches and what counts as done.
 * Kept separate from `progress.ts`, which defines the data model.
 */

/** Which completion states to show. `'all'` rather than `null` means no filter. */
export type ProblemStatus = 'all' | 'done' | 'todo';

/** The problem-level filters, as the user has them set. */
export type ProblemFilter = {
	topics: ProblemTopic[];
	status: ProblemStatus;
};

/**
 * True when a topic or status filter is set (text queries aside). The olympiad
 * page then hides years with no matching problems; the dialog lists the filtered
 * pool for an empty query.
 */
export function isFiltering({ topics, status }: ProblemFilter): boolean {
	return topics.length > 0 || status !== 'all';
}

/** True if the problem has any selected topic (OR). Untagged problems never match. */
export function matchesTopics(
	problemTopics: readonly ProblemTopic[] | undefined,
	topics: readonly ProblemTopic[]
): boolean {
	if (topics.length === 0) return true;
	return problemTopics?.some((t) => topics.includes(t)) ?? false;
}

/** Whether a problem's completion satisfies the status filter. */
export function matchesStatus(done: boolean, status: ProblemStatus): boolean {
	if (status === 'all') return true;
	return status === 'done' ? done : !done;
}

/** Whether the user has tracked a problem. See {@link GlobalProgressMap} for the nesting. */
export function isDone(
	progress: GlobalProgressMap,
	olympiadId: string,
	year: number,
	number: string
): boolean {
	return progress[olympiadId]?.[progressKey(year, number)] !== undefined;
}

/**
 * Search items matching both filters. With no filter it returns the same array
 * without reading `progress`, so `$derived` values downstream don't recompute.
 */
export function filterSearchItems(
	items: readonly SearchItem[],
	{ topics, status }: ProblemFilter,
	progress: GlobalProgressMap
): readonly SearchItem[] {
	if (topics.length === 0 && status === 'all') return items;
	return items.filter(
		(item) =>
			matchesTopics(item.problem.topics, topics) &&
			matchesStatus(isDone(progress, item.olympiadId, item.year, item.problem.number), status)
	);
}

/**
 * Case-insensitive substring match on id, name and summary (if present). A plain
 * boolean, not a fuzzy rank, so `OlympiadPicker` can keep its own row order.
 * `needle` must already be trimmed and lowercased; empty matches everything.
 */
export function matchesOlympiadText(
	olympiad: { id: string; name: string; summary?: string },
	needle: string
): boolean {
	if (needle === '') return true;
	return (
		olympiad.name.toLowerCase().includes(needle) ||
		olympiad.id.toLowerCase().includes(needle) ||
		(olympiad.summary?.toLowerCase().includes(needle) ?? false)
	);
}
