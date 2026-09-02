import type { ProblemTopic, SearchItem } from '$lib/types';
import { progressKey, type GlobalProgressMap } from '$lib/progress';

/**
 * The two filters a problem list can be narrowed by: topic and completion.
 *
 * Client-safe and route-agnostic, because two places apply exactly the same two
 * rules — the olympiad detail page's toolbar and the ⌘K dialog. The dialog lives
 * under `$lib/components/search/` and cannot import from a route directory, so
 * the rules had to move somewhere both sides can reach rather than be written
 * twice; a second copy of "what counts as done" would eventually disagree with
 * the first, and the disagreement would show up as two screens marking different
 * problems complete.
 *
 * Deliberately **not** folded into [`progress.ts`](./progress.ts). That module is
 * the domain model — what a score is, how a problem is filed, what completion
 * means. These are filter predicates *over* that model, chosen by the user and
 * discarded when they close the dialog. Keeping them apart is why
 * {@link ProblemStatus} sits here and {@link GlobalProgressMap} does not.
 */

/**
 * Which completion states a problem list should show.
 *
 * UI state, so it lives beside the domain model in `$lib/progress.ts` rather
 * than *in* it. `'all'` is a real member rather than `null` so that "no progress
 * filter" has exactly one spelling — every read would otherwise have to handle
 * both — and so the dropdown has a real option to select for it.
 */
export type ProblemStatus = 'all' | 'done' | 'todo';

/** The problem-level filters, as the user has them set. */
export type ProblemFilter = {
	topics: ProblemTopic[];
	status: ProblemStatus;
};

/**
 * True when a filter is narrowing the problem list *itself*, as opposed to a
 * text query.
 *
 * The olympiad page reads this to decide whether a year with no matching
 * problems may be dropped: a year with no problems at all still has notes, links
 * and files worth showing when nothing is being filtered. The dialog reads it to
 * decide whether an empty query should list the filtered pool instead of
 * nothing.
 */
export function isFiltering({ topics, status }: ProblemFilter): boolean {
	return topics.length > 0 || status !== 'all';
}

/**
 * Whether a problem's topics satisfy the topic filter.
 *
 * The selected topics are ORed within themselves — a problem tagged `Relativity`
 * matches a filter of `Relativity` *or* `Mechanics` — and an untagged problem
 * matches no topic filter at all, which is what makes the filter a way of
 * finding tagged problems rather than a way of hiding them.
 */
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

/**
 * Whether the user has tracked one problem, given a whole-archive progress map.
 *
 * **The olympiad level is load-bearing.** {@link progressKey} is `(year, number)`
 * only, because the olympiad page holds one olympiad's map and has no need for
 * more. Flattening the cross-archive map to those same keys would collide IPhO
 * 2019 T1 with APhO 2019 T1 and silently mark the wrong problems done — a wrong
 * answer with no visible symptom, which is the worst kind. Hence the nesting in
 * {@link GlobalProgressMap} and the two lookups here.
 */
export function isDone(
	progress: GlobalProgressMap,
	olympiadId: string,
	year: number,
	number: string
): boolean {
	// The key's existence is the completion flag; there is no field to read.
	return progress[olympiadId]?.[progressKey(year, number)] !== undefined;
}

/**
 * The ⌘K dialog's pool: every search item that satisfies both filters.
 *
 * The early return is not merely an optimisation, and it earns its place three
 * times over. With no filter active this never reads `progress`, so marking a
 * problem done does not re-filter the corpus. It returns the **same array**
 * rather than a copy, so `$derived`'s referential-identity check skips every
 * downstream recomputation — the parallel haystack is never rebuilt and the
 * whole layer costs one comparison per keystroke, not even an allocation over
 * the corpus.
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
