export type ContestTag = 'International' | 'Regional' | 'National' | 'Open';

/** A file type descriptor used at runtime (suffix not needed after generation). */
export type FileTypeLabel = {
	label: string;
};

/** A contest entry as written to contests.json. */
export type ContestEntry = {
	id: string;
	name: string;
	summary: string;
	icon: string;
	tag: ContestTag;
	/** Merged (global + contest-specific) year-level file type labels, in render order. */
	yearFileTypes: Record<string, FileTypeLabel>;
	/** Merged (global + contest-specific) problem-level file type labels, in render order. */
	problemFileTypes: Record<string, FileTypeLabel>;
	description?: string; // raw Markdown (in YAML)
	descriptionHtml?: string; // compiled HTML (in contests.json)
};

/** Shape of static/contests/<id>/index.yaml */
export type ContestIndexYaml = {
	name: string;
	summary: string;
	icon: string;
	tag: ContestTag;
	/** Display order on the homepage (lower = earlier). */
	order?: number;
	/**
	 * Contest-specific extra file types not in the global fileTypes.ts.
	 * These are appended after the global types when rendering file links.
	 */
	extraFileTypes?: {
		year?: Record<string, { suffix: string; label: string }>;
		problem?: Record<string, { suffix: string; label: string }>;
	};
	description?: string; // raw Markdown (in YAML)
};

/** Shape of static/contests/<id>/<year>/index.yaml */
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

export type FilesJson = Record<string, YearEntry[]>;
