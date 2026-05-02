export type OlympiadTag = 'International' | 'Regional' | 'National' | 'Open';

/** A file type descriptor used at runtime (suffix not needed after generation). */
export type FileTypeLabel = {
	label: string;
};

/** A olympiad entry as written to olympiads.json. */
export type OlympiadEntry = {
	id: string;
	name: string;
	summary: string;
	icon: string;
	tag: OlympiadTag;
	/** Merged (global + olympiad-specific) year-level file type labels, in render order. */
	yearFileTypes: Record<string, FileTypeLabel>;
	/** Merged (global + olympiad-specific) problem-level file type labels, in render order. */
	problemFileTypes: Record<string, FileTypeLabel>;
	description?: string; // raw Markdown (in YAML)
	descriptionHtml?: string; // compiled HTML (in olympiads.json)
};

/** Shape of static/olympiads/<id>/index.yaml */
export type OlympiadIndexYaml = {
	name: string;
	summary: string;
	icon: string;
	tag: OlympiadTag;
	/** Display order on the homepage (lower = earlier). */
	order?: number;
	/**
	 * Olympiad-specific extra file types not in the global fileTypes.ts.
	 * These are appended after the global types when rendering file links.
	 */
	extraFileTypes?: {
		year?: Record<string, { suffix: string; label: string }>;
		problem?: Record<string, { suffix: string; label: string }>;
	};
	description?: string; // raw Markdown (in YAML)
};

/** Shape of static/olympiads/<id>/<year>/index.yaml */
export type YearIndexYaml = {
	notes?: string[];
	extraLinks?: ExtraLink[];
	problems?: Record<string, { title?: string }>;
};

export type ExtraLink = {
	label: string;
	url: string;
};

export type ProblemEntry = {
	number: string;
	title?: string;
	files: Record<string, string>;
};

export type YearEntry = {
	year: number;
	notes: string[];
	extraLinks: ExtraLink[];
	yearFiles: Record<string, string>;
	problems: ProblemEntry[];
};

/** Shape of files.json */
export type FilesJson = Record<string, YearEntry[]>;

/** A problem entry with the extra properties needed for the UI in GlobalSearch.svelte */
export type SearchItem = {
	olympiadId: string;
	olympiadName: string;
	olympiadIcon: string;
	year: number;
	problem: ProblemEntry;
	probFTEntries: [string, FileTypeLabel][];
	searchText: string;
};
