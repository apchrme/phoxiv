import type { ProblemTopic } from '#lib/types.js';
import { matchesOlympiadsAndTopics } from '#lib/filters.js';
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
 * Accent colours a badge can take, each a `--badge-*` token in `app.css` that
 * every theme defines. Full class strings, not built from parts, so Tailwind
 * finds them.
 * `fg` colours the icon and `bg` tints the disc behind it.
 */
export const BADGE_COLORS = {
	mauve: {
		label: 'Mauve',
		fg: 'text-badge-mauve',
		bg: 'bg-badge-mauve/15',
		ring: 'ring-badge-mauve/40'
	},
	red: {
		label: 'Red',
		fg: 'text-badge-red',
		bg: 'bg-badge-red/15',
		ring: 'ring-badge-red/40'
	},
	peach: {
		label: 'Peach',
		fg: 'text-badge-peach',
		bg: 'bg-badge-peach/15',
		ring: 'ring-badge-peach/40'
	},
	yellow: {
		label: 'Yellow',
		fg: 'text-badge-yellow',
		bg: 'bg-badge-yellow/15',
		ring: 'ring-badge-yellow/40'
	},
	green: {
		label: 'Green',
		fg: 'text-badge-green',
		bg: 'bg-badge-green/15',
		ring: 'ring-badge-green/40'
	},
	teal: {
		label: 'Teal',
		fg: 'text-badge-teal',
		bg: 'bg-badge-teal/15',
		ring: 'ring-badge-teal/40'
	},
	sky: {
		label: 'Sky',
		fg: 'text-badge-sky',
		bg: 'bg-badge-sky/15',
		ring: 'ring-badge-sky/40'
	},
	blue: {
		label: 'Blue',
		fg: 'text-badge-blue',
		bg: 'bg-badge-blue/15',
		ring: 'ring-badge-blue/40'
	},
	lavender: {
		label: 'Lavender',
		fg: 'text-badge-lavender',
		bg: 'bg-badge-lavender/15',
		ring: 'ring-badge-lavender/40'
	},
	pink: {
		label: 'Pink',
		fg: 'text-badge-pink',
		bg: 'bg-badge-pink/15',
		ring: 'ring-badge-pink/40'
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
 * A filter badge uses {@link matchesOlympiadsAndTopics}, so it agrees with the
 * problem filters: OR within each list, the two ANDed, and an untagged problem
 * never matches a topic.
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
	if (rule.scope === 'filter' && !matchesOlympiadsAndTopics(row, rule.olympiadIds, rule.topics)) {
		return false;
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

/**
 * Display names by olympiad id, the form {@link describeBadge} takes them in,
 * from any list of olympiads (the server's rows, or the editor's options).
 */
export function olympiadNamesById(
	list: readonly { id: string; name: string }[]
): Record<string, string> {
	return Object.fromEntries(list.map((o) => [o.id, o.name]));
}

/** Whether {@link describeBadge} reads olympiad names for any of `rules`. */
export function needsOlympiadNames(rules: readonly BadgeRule[]): boolean {
	return rules.some((r) => r.scope === 'filter' && r.olympiadIds.length > 0);
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
 * Never lists a manual badge's problems. Those travel separately, as
 * {@link BadgeProblem}s on the badge's own page.
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

/** What anyone may see of a badge, whatever its rule: name, icon and the rest. */
export type BadgeFace = Pick<BadgeEntry, 'id' | 'name' | 'description' | 'icon' | 'color'>;

/**
 * A badge's {@link BadgeFace}, picked field by field so nothing else (above
 * all a hidden rule) can ride along into page data or a response.
 */
export function badgeFace(badge: BadgeEntry): BadgeFace {
	return {
		id: badge.id,
		name: badge.name,
		description: badge.description,
		icon: badge.icon,
		color: badge.color
	};
}

/**
 * A badge as one viewer may see it: its face, plus the criteria unless they
 * are hidden from that viewer ({@link visibleCriteria}). The dashboard calls it
 * per user; {@link toPublicBadge} with `earned = false` for everyone.
 */
export function toVisibleBadge(
	badge: BadgeEntry,
	olympiadNames: Readonly<Record<string, string>>,
	earned: boolean
): BadgeFace & ReturnType<typeof visibleCriteria> {
	return { ...badgeFace(badge), ...visibleCriteria(badge, olympiadNames, earned) };
}

/**
 * {@link PublicBadge}'s fields for one badge, from a badge and its holder count.
 * Shared by `/api/badges` and `/api/badges/[id]`, so the two can't disagree.
 * Never "earned": both are shared by every viewer, so a hidden requirement is
 * left out, and holders get it from `/progress/badges`.
 */
export function toPublicBadge(
	badge: BadgeEntry & { holders: number },
	olympiadNames: Readonly<Record<string, string>>
): PublicBadge {
	return { ...toVisibleBadge(badge, olympiadNames, false), holders: badge.holders };
}

/** A problem addressed as the app addresses it, never by `problems.id`. */
export type ProblemRef = { olympiadId: string; year: number; number: string };

/**
 * A string that identifies a {@link ProblemRef}, for maps, sets and `#each`
 * keys. The NUL separator can't occur in an olympiad id or a problem number.
 */
export function problemRefKey(ref: ProblemRef): string {
	return `${ref.olympiadId}\u0000${ref.year}\u0000${ref.number}`;
}

/**
 * One problem of a manual badge, addressed as the app addresses problems, never
 * by `problems.id`. No `topics`: problems are never listed with them, to
 * reduce clutter (docs/data-model.md).
 */
export type BadgeProblem = {
	olympiadId: string;
	olympiadName: string;
	year: number;
	number: string;
	title: string | null;
};

/**
 * One badge as `GET /api/badges/[id]` serves it, for the badge's own page.
 * Shared-cached and public, like {@link PublicBadge}. Changing this shape
 * needs a cache purge; see docs/deployment.md.
 */
export type PublicBadgeDetail = PublicBadge & {
	/**
	 * A manual badge's problems, in olympiad, year and number order. `null` for
	 * any other scope, and for a manual badge whose requirement is hidden: the
	 * list is the requirement. A holder gets it from `/progress/badges`.
	 */
	problems: BadgeProblem[] | null;
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
		 * The requirement, set only for a hidden badge this user has earned, which
		 * `/api/badges` can't show; `null` otherwise. `problems` is the manual
		 * badge's list, as in {@link PublicBadgeDetail}, else `null`.
		 */
		revealed: { summary: string; requiredCount: number; problems: BadgeProblem[] | null } | null;
	}
>;

/** A badge as one viewer sees it: the shared response with their standing laid over it. */
export type MergedStanding = {
	/** Whether the viewer holds it; `false` signed out or before the standing arrives. */
	earned: boolean;
	earnedAt: string | null;
	/** `null` while the requirement is hidden from this viewer. */
	summary: string | null;
	requiredCount: number | null;
	/** Qualifying completions; `null` signed out, or while hidden. */
	count: number | null;
	/** A manual badge's list where the viewer may see it, else `null`. */
	problems: BadgeProblem[] | null;
	holders: number;
};

/**
 * Lays the viewer's `/progress/badges` entry over the shared-cached badge, as
 * `/badges` and a badge's own page show it.
 *
 * A hidden requirement comes only from the entry's `revealed`, and only once
 * the viewer holds the badge. The holder count can be a day old while the
 * standing never is, so a badge the viewer holds never says "0 people".
 */
export function mergeStanding(
	badge: PublicBadge & { problems?: BadgeProblem[] | null },
	entry: BadgeProgressMap[string] | undefined
): MergedStanding {
	const earned = !!entry?.earnedAt;
	return {
		earned,
		earnedAt: entry?.earnedAt ?? null,
		summary: badge.summary ?? entry?.revealed?.summary ?? null,
		requiredCount: badge.requiredCount ?? entry?.revealed?.requiredCount ?? null,
		count: entry?.count ?? null,
		problems: badge.problems ?? entry?.revealed?.problems ?? null,
		holders: Math.max(badge.holders, earned ? 1 : 0)
	};
}

/** Longest badge name the editor accepts. Cards truncate beyond about this. */
export const BADGE_NAME_MAX = 60;

/** Longest badge description the editor accepts. */
export const BADGE_DESCRIPTION_MAX = 280;
