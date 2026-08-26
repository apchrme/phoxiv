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
	 * Topics assigned to this problem. Never rendered next to the problem — they
	 * would spoil it — but used by the topic filter on the olympiad page.
	 * Omitted by endpoints that don't need them (e.g. the search index).
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
