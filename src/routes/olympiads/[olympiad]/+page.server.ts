import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { YearEntry } from '$lib/pregen/types.js';

type OlympiadRow = {
	id: string;
	name: string;
	summary: string;
	icon: string;
	tag: string;
	description_html: string | null;
	year_file_types: string;
	problem_file_types: string;
};

type YearRow = {
	id: number;
	year: number;
	notes: string;
	extra_links: string;
};

type YearFileRow = {
	year_id: number;
	file_type: string;
	url: string;
};

type ProblemRow = {
	id: number;
	year_id: number;
	number: string;
	title: string | null;
};

type ProblemFileRow = {
	problem_id: number;
	file_type: string;
	url: string;
};

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = platform?.env.DB;
	if (!db) error(500, { message: 'Database unavailable' });

	const row = await db
		.prepare('SELECT * FROM olympiads WHERE id = ?')
		.bind(params.olympiad)
		.first<OlympiadRow>();

	if (!row) error(404, { message: 'Not found' });

	const olympiad = {
		id: row.id,
		name: row.name,
		summary: row.summary,
		icon: row.icon,
		tag: row.tag,
		descriptionHtml: row.description_html,
		yearFileTypes: JSON.parse(row.year_file_types) as Record<string, { label: string }>,
		problemFileTypes: JSON.parse(row.problem_file_types) as Record<string, { label: string }>
	};

	const { results: yearRows } = await db
		.prepare('SELECT * FROM years WHERE olympiad_id = ? ORDER BY year DESC')
		.bind(params.olympiad)
		.all<YearRow>();

	if (yearRows.length === 0) {
		return { olympiad, olympiadFiles: [] as YearEntry[] };
	}

	const yearIds = yearRows.map((y) => y.id);
	const yp = yearIds.map(() => '?').join(',');

	const [{ results: yearFileRows }, { results: problemRows }] = await Promise.all([
		db
			.prepare(`SELECT year_id, file_type, url FROM year_files WHERE year_id IN (${yp})`)
			.bind(...yearIds)
			.all<YearFileRow>(),
		db
			.prepare(`SELECT * FROM problems WHERE year_id IN (${yp}) ORDER BY number`)
			.bind(...yearIds)
			.all<ProblemRow>()
	]);

	let problemFileRows: ProblemFileRow[] = [];
	if (problemRows.length > 0) {
		const problemIds = problemRows.map((p) => p.id);
		const pp = problemIds.map(() => '?').join(',');
		const { results } = await db
			.prepare(`SELECT problem_id, file_type, url FROM problem_files WHERE problem_id IN (${pp})`)
			.bind(...problemIds)
			.all<ProblemFileRow>();
		problemFileRows = results;
	}

	// Build lookup maps
	const yearFilesMap = new Map<number, Record<string, string>>();
	for (const yf of yearFileRows) {
		const entry = yearFilesMap.get(yf.year_id) ?? {};
		entry[yf.file_type] = yf.url;
		yearFilesMap.set(yf.year_id, entry);
	}

	const problemFilesMap = new Map<number, Record<string, string>>();
	for (const pf of problemFileRows) {
		const entry = problemFilesMap.get(pf.problem_id) ?? {};
		entry[pf.file_type] = pf.url;
		problemFilesMap.set(pf.problem_id, entry);
	}

	const problemsByYear = new Map<number, YearEntry['problems']>();
	for (const p of problemRows) {
		const list = problemsByYear.get(p.year_id) ?? [];
		list.push({
			number: p.number,
			...(p.title ? { title: p.title } : {}),
			files: problemFilesMap.get(p.id) ?? {}
		});
		problemsByYear.set(p.year_id, list);
	}

	const olympiadFiles: YearEntry[] = yearRows.map((y) => ({
		year: y.year,
		notes: JSON.parse(y.notes) as string[],
		extraLinks: JSON.parse(y.extra_links) as YearEntry['extraLinks'],
		yearFiles: yearFilesMap.get(y.id) ?? {},
		problems: problemsByYear.get(y.id) ?? []
	}));

	return { olympiad, olympiadFiles };
};