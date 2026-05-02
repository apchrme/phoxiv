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

export type ProblemEntry = {
	number: string;
	title?: string;
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
