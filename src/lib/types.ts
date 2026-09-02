/**
 * How wide an olympiad's field is. Used for the filter on the olympiads page
 * and as the `tag` column's allowed values.
 *
 * `src/lib/server/db/schema.ts` repeats these literals in its `enum:` option:
 * drizzle-kit bundles the schema with its own resolver, so `$lib` does not
 * resolve there. Keep the two in sync.
 */
export const OLYMPIAD_TAGS = ['International', 'Regional', 'National', 'Open'] as const;

export type OlympiadTag = (typeof OLYMPIAD_TAGS)[number];

/** Narrows an arbitrary string to an `OlympiadTag`, for validating form input. */
export function isOlympiadTag(value: string): value is OlympiadTag {
	return (OLYMPIAD_TAGS as readonly string[]).includes(value);
}

/** A olympiad entry. */
export type OlympiadEntry = {
	id: string;
	name: string;
	summary: string;
	icon: string;
	tag: OlympiadTag;
	description?: string;
	descriptionHtml?: string;
};

export type ExtraLink = {
	label: string;
	url: string;
};

export type FileEntry = {
	label: string;
	url: string;
};

/**
 * The fixed set of physics topics a problem can be tagged with. Topics are
 * deliberately coarse — they are only used for filtering, and a finer-grained
 * list would risk spoiling the problem.
 */
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
	 * Topics assigned to this problem.
	 *
	 * **Never rendered next to a problem** — that would spoil it. That, and not
	 * "never on the wire", is the invariant: topics ride on both public payloads,
	 * `/api/olympiads/[olympiad]` and `/api/search`, because both the olympiad
	 * page's topic filter and the ⌘K dialog's run entirely in the browser over
	 * the body they already hold.
	 *
	 * Optional only because a *cached* payload may predate the field.
	 * `getSearchIndex` emits `[]` for an untagged problem rather than omitting the
	 * key, which is what makes `undefined` mean exactly one thing on the client:
	 * "this body was cached before topics shipped".
	 */
	topics?: ProblemTopic[];
	/**
	 * The denominator a tracked score is shown against. **Omitted, never null**,
	 * when no contributor has set one — the same convention `title` follows above,
	 * and most problems have none.
	 *
	 * Public, and therefore in the shared-cached `/api/olympiads/[olympiad]` body:
	 * a marking scheme's maximum is the same for every visitor, so it belongs with
	 * the rest of a problem's metadata rather than travelling with the signed-in
	 * user's own progress. Only the score *against* it is per-user.
	 */
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

/** A problem entry with the extra properties the ⌘K search UI needs — see
 *  `$lib/components/search/`. `searchText` is what the fuzzy matcher runs over. */
export type SearchItem = {
	olympiadId: string;
	olympiadName: string;
	olympiadIcon: string;
	year: number;
	problem: ProblemEntry;
	searchText: string;
};

/** Which corpus the ⌘K dialog is searching. See `$lib/components/search/`. */
export type SearchMode = 'problems' | 'files';

/** One problem a matched file is attached to. */
export type FileSearchProblem = {
	number: string;
	title?: string;
};

/**
 * One hit from deep (in-file) search.
 *
 * **The result unit is a file, not a problem, and that is deliberate.** A
 * year-level PDF routinely contains every problem of that year, so a
 * problem-level hit would claim "IPhO 2019 T2" on the strength of text belonging
 * to T1. Making the file the unit removes the ambiguity: the row says *this
 * document contains your phrase*, which is exactly what the index knows.
 */
export type FileSearchResult = {
	/** The file itself. `url` is the hit's identity, unique within a response. */
	file: FileEntry;
	olympiadId: string;
	olympiadName: string;
	olympiadIcon: string;
	year: number;
	/**
	 * The problems this file is attached to, in creation order. **Empty means
	 * year-level** — the emptiness *is* the flag, exactly as an absent key is the
	 * only spelling of "untracked" in a `ProgressMap`. There is no `level` field.
	 */
	problems: FileSearchProblem[];
	/**
	 * A plain-text excerpt, whitespace collapsed. **Never HTML.**
	 *
	 * FTS5's `snippet()` does not escape the text around a match, and that text
	 * comes out of contributor-uploaded PDFs — so sending `<mark>`-marked HTML and
	 * rendering it with `{@html}` would be stored XSS on our own origin. The marks
	 * travel as offsets instead; see `matches`.
	 */
	snippet: string;
	/**
	 * `[start, end)` UTF-16 code-unit offsets into `snippet` that matched,
	 * ascending and non-overlapping. The client slices `snippet` with these and
	 * renders the pieces as text; nothing here ever reaches `{@html}`.
	 */
	matches: [number, number][];
};

/**
 * The body of `GET /api/search/files`.
 *
 * An envelope rather than a bare array, unlike the four older public shapes,
 * because `truncated` and `indexEmpty` have to travel — and `indexEmpty` is what
 * lets a launch before the backfill finishes say "still indexing" rather than
 * "no matches".
 *
 * **There is no `rank` field, deliberately.** A bm25 float is an artefact of
 * which index was chosen — negative, unbounded, and meaningless if the index is
 * ever swapped, at which point the field would have to be faked to keep the
 * shape. `results` is sorted; the array order *is* the rank. It also cannot be
 * interleaved with uFuzzy's ordinal ranking, which is exactly why the dialog
 * shows one kind of result at a time.
 */
export type FileSearchResponse = {
	/** The query actually run, normalised and capped: what the UI should echo. */
	query: string;
	/** Best first. */
	results: FileSearchResult[];
	/** More files matched than were returned. */
	truncated: boolean;
	/** The text index holds no rows at all. Only ever true when `results` is empty. */
	indexEmpty: boolean;
};
