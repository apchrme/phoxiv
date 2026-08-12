export type OlympiadTag = 'International' | 'Regional' | 'National' | 'Open';

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
	files: FileEntry[];
};

export type YearEntry = {
	year: number;
	notes: string[];
	extraLinks: ExtraLink[];
	yearFiles: FileEntry[];
	problems: ProblemEntry[];
};

/** Shape of files.json (legacy pregen — no longer used) */
export type FilesJson = Record<string, YearEntry[]>;

/** A problem entry with the extra properties needed for the UI in GlobalSearch.svelte */
export type SearchItem = {
	olympiadId: string;
	olympiadName: string;
	olympiadIcon: string;
	year: number;
	problem: ProblemEntry;
	searchText: string;
};
