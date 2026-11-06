import type { ProblemTopic } from '#lib/types.js';
import { matchesTopics } from '#lib/filters.js';
import { plural } from '#lib/utils/plural.js';

/*
 * What a badge is and when a completion counts towards it. Client-safe, so the
 * dashboard, `/badges` and the admin editor describe badges the same way.
 *
 * `qualifies` is the rule for one user's rows. `recomputeBadge` in
 * `#lib/server/db/queries/badges.ts` restates it in SQL to re-evaluate every
 * user at once after an admin edit. Change the two together; the e2e spec
 * `admin/badges.spec.ts` checks that they agree.
 */

/**
 * Which problems a badge counts. `schema.ts` repeats these in the `scope` enum
 * (it can't import `#lib`); keep them in sync.
 * - `all`: every problem.
 * - `filter`: a live rule over topics and olympiads, so new problems count.
 * - `manual`: an explicit list in `badge_problems`.
 */
export const BADGE_SCOPES = ['all', 'filter', 'manual'] as const;

export type BadgeScope = (typeof BADGE_SCOPES)[number];

/** Narrows an arbitrary string to a {@link BadgeScope}, for validating form input. */
export function isBadgeScope(value: string): value is BadgeScope {
	return (BADGE_SCOPES as readonly string[]).includes(value);
}

/**
 * Accent colours a badge can take: Catppuccin Latte in light mode, Mocha in
 * dark. Full class strings, not built from parts, so Tailwind finds them.
 * `fg` colours the icon and `bg` tints the disc behind it.
 */
export const BADGE_COLORS = {
	mauve: {
		label: 'Mauve',
		fg: 'text-[#8839ef] dark:text-[#cba6f7]',
		bg: 'bg-[#8839ef]/15 dark:bg-[#cba6f7]/15',
		ring: 'ring-[#8839ef]/40 dark:ring-[#cba6f7]/40'
	},
	red: {
		label: 'Red',
		fg: 'text-[#d20f39] dark:text-[#f38ba8]',
		bg: 'bg-[#d20f39]/15 dark:bg-[#f38ba8]/15',
		ring: 'ring-[#d20f39]/40 dark:ring-[#f38ba8]/40'
	},
	peach: {
		label: 'Peach',
		fg: 'text-[#fe640b] dark:text-[#fab387]',
		bg: 'bg-[#fe640b]/15 dark:bg-[#fab387]/15',
		ring: 'ring-[#fe640b]/40 dark:ring-[#fab387]/40'
	},
	yellow: {
		label: 'Yellow',
		fg: 'text-[#df8e1d] dark:text-[#f9e2af]',
		bg: 'bg-[#df8e1d]/15 dark:bg-[#f9e2af]/15',
		ring: 'ring-[#df8e1d]/40 dark:ring-[#f9e2af]/40'
	},
	green: {
		label: 'Green',
		fg: 'text-[#40a02b] dark:text-[#a6e3a1]',
		bg: 'bg-[#40a02b]/15 dark:bg-[#a6e3a1]/15',
		ring: 'ring-[#40a02b]/40 dark:ring-[#a6e3a1]/40'
	},
	teal: {
		label: 'Teal',
		fg: 'text-[#179299] dark:text-[#94e2d5]',
		bg: 'bg-[#179299]/15 dark:bg-[#94e2d5]/15',
		ring: 'ring-[#179299]/40 dark:ring-[#94e2d5]/40'
	},
	sky: {
		label: 'Sky',
		fg: 'text-[#04a5e5] dark:text-[#89dceb]',
		bg: 'bg-[#04a5e5]/15 dark:bg-[#89dceb]/15',
		ring: 'ring-[#04a5e5]/40 dark:ring-[#89dceb]/40'
	},
	blue: {
		label: 'Blue',
		fg: 'text-[#1e66f5] dark:text-[#89b4fa]',
		bg: 'bg-[#1e66f5]/15 dark:bg-[#89b4fa]/15',
		ring: 'ring-[#1e66f5]/40 dark:ring-[#89b4fa]/40'
	},
	lavender: {
		label: 'Lavender',
		fg: 'text-[#7287fd] dark:text-[#b4befe]',
		bg: 'bg-[#7287fd]/15 dark:bg-[#b4befe]/15',
		ring: 'ring-[#7287fd]/40 dark:ring-[#b4befe]/40'
	},
	pink: {
		label: 'Pink',
		fg: 'text-[#ea76cb] dark:text-[#f5c2e7]',
		bg: 'bg-[#ea76cb]/15 dark:bg-[#f5c2e7]/15',
		ring: 'ring-[#ea76cb]/40 dark:ring-[#f5c2e7]/40'
	}
} as const;

export type BadgeColor = keyof typeof BADGE_COLORS;

export const BADGE_COLOR_KEYS = Object.keys(BADGE_COLORS) as BadgeColor[];

/** Narrows an arbitrary string to a {@link BadgeColor}. */
export function isBadgeColor(value: string): value is BadgeColor {
	return Object.hasOwn(BADGE_COLORS, value);
}

/**
 * Icon keys a badge can use. The components are in `#lib/badge-icons.ts`, kept
 * apart so server code that validates a key doesn't import Svelte components.
 */
export const BADGE_ICON_KEYS = [
	'trophy',
	'medal',
	'award',
	'crown',
	'star',
	'sparkles',
	'gem',
	'target',
	'flame',
	'zap',
	'atom',
	'orbit',
	'rocket',
	'telescope',
	'magnet',
	'thermometer',
	'lightbulb',
	'sigma',
	'infinity',
	'mountain'
] as const;

export type BadgeIcon = (typeof BADGE_ICON_KEYS)[number];

/** Narrows an arbitrary string to a {@link BadgeIcon}. */
export function isBadgeIcon(value: string): value is BadgeIcon {
	return (BADGE_ICON_KEYS as readonly string[]).includes(value);
}

/** The criteria of a badge, as both evaluators read them. */
export type BadgeRule = {
	id: number;
	requiredCount: number;
	scoreMinPct: number | null;
	scoreMaxPct: number | null;
	scope: BadgeScope;
	/** `filter` scope only. Empty means no topic restriction. */
	topics: ProblemTopic[];
	/** `filter` scope only. Empty means no olympiad restriction. */
	olympiadIds: string[];
};

/** A badge as stored, with its JSON columns parsed. */
export type BadgeEntry = BadgeRule & {
	name: string;
	description: string;
	icon: string;
	color: string;
	/** Users see the badge but not its criteria or their progress; see {@link visibleCriteria}. */
	requirementHidden: boolean;
};

/**
 * Orders badges as every list shows them: most holders first, then oldest
 * first. Sorts in place.
 */
export function sortByHolders<T extends { id: number; holders: number }>(list: T[]): T[] {
	return list.sort((a, b) => b.holders - a.holders || a.id - b.id);
}

/** One completed problem, with what the rule needs to know about it. */
export type QualifyingInput = {
	problemId: number;
	olympiadId: string;
	topics: readonly ProblemTopic[];
	maxScore: number | null;
	score: number | null;
};

/** Whether a range is set. With no range, any completion counts, scored or not. */
export function hasScoreRange(rule: Pick<BadgeRule, 'scoreMinPct' | 'scoreMaxPct'>): boolean {
	return rule.scoreMinPct !== null || rule.scoreMaxPct !== null;
}

/**
 * Whether one completed problem counts towards `rule`.
 *
 * Topics use {@link matchesTopics}, so a filter badge agrees with the problem
 * filters: OR within topics, and an untagged problem never matches a topic.
 * Olympiads are also OR, and the two lists are ANDed.
 *
 * The score test compares `score * 100` against `pct * maxScore` instead of
 * dividing, so a score exactly on a bound (8.5 of 10 against 85%) is inside it.
 *
 * @param manual the problem ids of `rule`, when it is a manual badge.
 */
export function qualifies(
	rule: BadgeRule,
	row: QualifyingInput,
	manual: ReadonlySet<number> | undefined
): boolean {
	if (rule.scope === 'manual' && !manual?.has(row.problemId)) return false;
	if (rule.scope === 'filter') {
		if (rule.olympiadIds.length > 0 && !rule.olympiadIds.includes(row.olympiadId)) return false;
		if (!matchesTopics(row.topics, rule.topics)) return false;
	}
	if (!hasScoreRange(rule)) return true;
	if (row.score === null || row.maxScore === null) return false;
	const scaled = row.score * 100;
	if (rule.scoreMinPct !== null && scaled < rule.scoreMinPct * row.maxScore) return false;
	if (rule.scoreMaxPct !== null && scaled > rule.scoreMaxPct * row.maxScore) return false;
	return true;
}

/** A percentage for display, at most one decimal: `85`, `87.5`. */
function pct(value: number): string {
	return `${Math.round(value * 10) / 10}%`;
}

/** "scoring at least 80%", "scoring 50–80%", or `''` without a range. */
function scorePhrase(rule: Pick<BadgeRule, 'scoreMinPct' | 'scoreMaxPct'>): string {
	const { scoreMinPct: min, scoreMaxPct: max } = rule;
	if (min !== null && max !== null) {
		return min === max ? `scoring exactly ${pct(min)}` : `scoring ${pct(min)}–${pct(max)}`;
	}
	if (min !== null) return `scoring at least ${pct(min)}`;
	if (max !== null) return `scoring at most ${pct(max)}`;
	return '';
}

/** "A, B or C". */
function orList(items: readonly string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/**
 * The criteria in one sentence: "Complete 10 Thermodynamics problems",
 * "Complete 5 IPhO problems, scoring at least 80%".
 *
 * Never lists a manual badge's problems: next to a filter badge's topics that
 * could pair a problem with its topic, which docs/data-model.md rules out.
 *
 * @param olympiadNames display names by id; unknown ids show as the id.
 */
export function describeBadge(
	rule: BadgeRule,
	olympiadNames: Readonly<Record<string, string>> = {}
): string {
	const n = rule.requiredCount;
	let noun: string;
	if (rule.scope === 'manual') {
		noun = `${n} of the selected problems`;
	} else {
		const parts: string[] = [];
		if (rule.scope === 'filter' && rule.olympiadIds.length > 0) {
			parts.push(orList(rule.olympiadIds.map((id) => olympiadNames[id] ?? id)));
		}
		if (rule.scope === 'filter' && rule.topics.length > 0) parts.push(orList(rule.topics));
		noun = plural(n, [...parts, 'problem'].join(' '), [...parts, 'problems'].join(' '));
	}
	const score = scorePhrase(rule);
	return `Complete ${noun}${score ? `, ${score}` : ''}`;
}

/**
 * Whether a viewer may see a badge's requirement: always, unless it is hidden,
 * and then only once they have earned it. Awards are revocable, so losing the
 * badge hides it again.
 *
 * @param earned whether this viewer holds the badge; `false` for a response
 *   that isn't one user's, such as the shared-cached `/api/badges`.
 */
export function isRequirementVisible(badge: BadgeEntry, earned: boolean): boolean {
	return !badge.requirementHidden || earned;
}

/**
 * The criteria as a viewer may see them: {@link describeBadge}'s sentence and
 * the count required, or `null` for both where {@link isRequirementVisible}
 * says no.
 *
 * Everything that sends a badge to a non-admin goes through this, so a hidden
 * rule never leaves the server. Pair it with {@link visibleCount} for progress:
 * "3/5" next to the name would give most of the rule away.
 */
export function visibleCriteria(
	badge: BadgeEntry,
	olympiadNames: Readonly<Record<string, string>>,
	earned: boolean
): { summary: string | null; requiredCount: number | null } {
	if (!isRequirementVisible(badge, earned)) return { summary: null, requiredCount: null };
	return { summary: describeBadge(badge, olympiadNames), requiredCount: badge.requiredCount };
}

/** A viewer's qualifying completions as they may see them: `null` while hidden. */
export function visibleCount(badge: BadgeEntry, count: number, earned: boolean): number | null {
	return isRequirementVisible(badge, earned) ? count : null;
}

/**
 * One badge as `GET /api/badges` serves it, most holders first. Shared-cached
 * and public: counts only, never who holds it (docs/auth.md). Changing this
 * shape needs a cache purge; see docs/deployment.md.
 */
export type PublicBadge = {
	id: number;
	name: string;
	description: string;
	icon: string;
	color: string;
	/**
	 * {@link describeBadge}'s sentence, built server-side with olympiad names.
	 * `null`, like `requiredCount`, when the requirement is hidden. A holder
	 * gets it from `/progress/badges` instead.
	 */
	summary: string | null;
	requiredCount: number | null;
	/** How many people hold it, as of the cached response. */
	holders: number;
};

/** Where the user stands on one badge, by badge id. Body of `GET /progress/badges`. */
export type BadgeProgressMap = Record<
	string,
	{
		/**
		 * Qualifying completions, which can exceed the badge's `requiredCount`.
		 * `null` while the requirement is hidden from this user.
		 */
		count: number | null;
		/** ISO time the award was recorded, or `null` while not earned. */
		earnedAt: string | null;
		/**
		 * The requirement, set only for a hidden badge this user has earned: the
		 * one case where they may see what `/api/badges` can't show. `null`
		 * otherwise, including for every badge that isn't hidden.
		 */
		revealed: { summary: string; requiredCount: number } | null;
	}
>;

/** Longest badge name the editor accepts. Cards truncate beyond about this. */
export const BADGE_NAME_MAX = 60;

/** Longest badge description the editor accepts. */
export const BADGE_DESCRIPTION_MAX = 280;
