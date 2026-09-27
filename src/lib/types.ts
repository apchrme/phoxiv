/**
 * An olympiad's scope, used by the olympiads page filter. `schema.ts` repeats
 * these in the `tag` enum (it can't import `$lib`); keep them in sync.
 */
export const OLYMPIAD_TAGS = ['International', 'Regional', 'National', 'Open'] as const;

export type OlympiadTag = (typeof OLYMPIAD_TAGS)[number];

/** Narrows an arbitrary string to an `OlympiadTag`, for validating form input. */
export function isOlympiadTag(value: string): value is OlympiadTag {
	return (OLYMPIAD_TAGS as readonly string[]).includes(value);
}

/** An olympiad, as served publicly. */
export type OlympiadEntry = {
	id: string;
	name: string;
	summary: string;
	icon: string;
	tag: OlympiadTag;
	description?: string;
	descriptionHtml?: string;
};

/**
 * What `OlympiadPicker` needs for one row. {@link OlympiadEntry} also fits, so the
 * search dialog passes those directly; contribute and admin pass the narrower
 * `listOlympiadOptions` rows.
 */
export type OlympiadOption = {
	id: string;
	name: string;
	icon?: string;
};

export type ExtraLink = {
	label: string;
	url: string;
};

export type FileEntry = {
	label: string;
	url: string;
};

/** Problem topics, for filtering only. Kept coarse so they don't spoil problems. */
export const PROBLEM_TOPICS = [
	'Mechanics',
	'Electromagnetism',
	'Thermodynamics',
	'Waves and Optics',
	'Relativity',
	'Modern',
	'Others'
] as const;

export type ProblemTopic = (typeof PROBLEM_TOPICS)[number];

export type ProblemEntry = {
	number: string;
	title?: string;
	/**
	 * Sent in the public payloads for client-side filtering, but never render
	 * them next to a problem (spoilers). `undefined` means a stale cached body
	 * from before topics existed; untagged problems get `[]`.
	 */
	topics?: ProblemTopic[];
	/** Max score for tracked progress. Omitted, not null, when unset. */
	maxScore?: number;
	files: FileEntry[];
};

export type YearEntry = {
	year: number;
	notes: string[];
	extraLinks: ExtraLink[];
	yearFiles: FileEntry[];
	problems: ProblemEntry[];
};

/** A problem for the search dialog. `searchText` is what the fuzzy matcher runs over. */
export type SearchItem = {
	olympiadId: string;
	olympiadName: string;
	olympiadIcon: string;
	year: number;
	problem: ProblemEntry;
	searchText: string;
};

/** What the search dialog is searching. */
export type SearchMode = 'problems' | 'files';

/** One problem a matched file is attached to. */
export type FileSearchProblem = {
	number: string;
	title?: string;
};

/**
 * One deep (in-file) search hit. The unit is a file, not a problem: a year-level
 * PDF often holds every problem, so the index can't say which one matched.
 */
export type FileSearchResult = {
	/** `url` identifies the hit; unique within a response. */
	file: FileEntry;
	olympiadId: string;
	olympiadName: string;
	olympiadIcon: string;
	year: number;
	/** Problems this file is attached to, in creation order. Empty means year-level. */
	problems: FileSearchProblem[];
	/**
	 * Plain-text excerpt, never HTML. FTS5 `snippet()` doesn't escape uploaded
	 * text, so rendering it with `{@html}` would be stored XSS. Highlights are
	 * sent as offsets in `matches`.
	 */
	snippet: string;
	/** Sorted, non-overlapping `[start, end)` UTF-16 offsets of matches in `snippet`. */
	matches: [number, number][];
};

/**
 * The body of `GET /api/search/files`. `results` is sorted best first; there is
 * no `rank` field, so bm25 scores never become part of the cached shape.
 */
export type FileSearchResponse = {
	/** The query as the server understood it: normalised, phrases re-quoted, nothing dropped. */
	query: string;
	/** Best first. */
	results: FileSearchResult[];
	/** More files matched than were returned. */
	truncated: boolean;
	/** The index is empty, so the UI can say "still indexing". Implies no results. */
	indexEmpty: boolean;
};

// ── Admin panel shapes ──────────────────────────────────────────────────────

// Bodies of `GET /admin/index-stats` and `GET /admin/activity`. Unlike the public
// shapes above, these are uncached and can change freely. They live here because
// client components render them.

/** One row of the admin panel's status breakdown. */
export type FileTextStat = { status: string; count: number };

/** Counts by status, plus the failures worth showing. */
export type FileTextStats = {
	counts: FileTextStat[];
	failures: { url: string; status: string; error: string | null; attempts: number }[];
	/** Distinct files in the archive, across both file tables. */
	indexed: number;
};

/**
 * One activity log row. `createdAt` is a `Date` from the page load (devalue) and
 * an ISO string from the JSON endpoint; `formatDateTime` takes both.
 */
export type ActivityEntry = {
	id: number;
	userName: string;
	action: string;
	detail: string;
	olympiadId: string | null;
	year: number | null;
	createdAt: Date | string;
};
