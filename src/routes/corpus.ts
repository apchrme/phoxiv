/**
 * The eighteen files shown in the landing page's corpus band.
 *
 * Page-only data, so it sits beside `+page.svelte` rather than under `$lib`
 * (CLAUDE.md rule 4). A non-`+` file in `src/routes/` is inert to the router.
 *
 * This is the single source of truth for **both** halves of the band: the
 * offline renderer in `$lib/server/thumbs-cli.ts` reads it to know which PDFs to
 * fetch and what to name each thumbnail, and `CorpusBand.svelte` reads it to lay
 * the tiles out. Add an entry here, re-run `bun run thumbs:render`, commit the
 * PNG — there is no third place to edit.
 *
 * The selection is deliberately hand-picked rather than sampled: it spans 1967
 * to 2026, nine writing systems, and the whole label vocabulary the schema
 * actually holds (problems, solutions, answer sheets, marking minutes, an
 * experiment). The copy above the band says so in as many words, so nothing
 * implies this is a live or random slice of the archive.
 *
 * Every `url` is a real `cdn.phoxiv.org` URL copied out of the production API,
 * not constructed here. Both the key layout and `slugifyLabel` are frozen
 * (CLAUDE.md rule 3), but a stored URL is still the only thing guaranteed to
 * match the object that exists.
 */
export type CorpusEntry = {
	/** Thumbnail filename stem — `src/lib/assets/thumbs/<slug>.png`. */
	slug: string;
	/** `olympiads.id`. There is no short-name column, hence `label` below. */
	olympiad: string;
	/** How the olympiad is written on the tile — the acronym, not the full name. */
	label: string;
	year: number;
	/** The problem number, when the file hangs off a problem rather than a year. */
	num?: string;
	/** The file's real label, as stored. */
	file: string;
	url: string;
};

export const CORPUS: CorpusEntry[] = [
	{
		slug: 'ipho-1967',
		olympiad: 'ipho',
		label: 'IPhO',
		year: 1967,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/ipho/1967.pdf'
	},
	{
		slug: 'ipho-2016-t1-a',
		olympiad: 'ipho',
		label: 'IPhO',
		year: 2016,
		num: 'T1',
		file: 'Answer Sheet',
		url: 'https://cdn.phoxiv.org/olympiads/ipho/2016/T1_A.pdf'
	},
	{
		slug: 'ipho-2016-min',
		olympiad: 'ipho',
		label: 'IPhO',
		year: 2016,
		file: 'Minutes',
		url: 'https://cdn.phoxiv.org/olympiads/ipho/2016_min.pdf'
	},
	{
		slug: 'apho-2017-e',
		olympiad: 'apho',
		label: 'APhO',
		year: 2017,
		file: 'Experiment',
		url: 'https://cdn.phoxiv.org/olympiads/apho/2017/E1.pdf'
	},
	{
		slug: 'eupho-2021-t',
		olympiad: 'eupho',
		label: 'EuPhO',
		year: 2021,
		file: 'Theory',
		url: 'https://cdn.phoxiv.org/olympiads/eupho/2021_T.pdf'
	},
	{
		slug: 'eotvos-1994-s',
		olympiad: 'eotvos',
		label: 'Eötvös',
		year: 1994,
		file: 'Solutions',
		url: 'https://cdn.phoxiv.org/olympiads/eotvos/1994_S.pdf'
	},
	{
		slug: 'izho-2013-t-s',
		olympiad: 'izho',
		label: 'IZhO',
		year: 2013,
		file: 'Theory Solutions',
		url: 'https://cdn.phoxiv.org/olympiads/izho/2013_T_S.pdf'
	},
	{
		slug: 'nbpho-2006',
		olympiad: 'nbpho',
		label: 'NBPhO',
		year: 2006,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/nbpho/2006.pdf'
	},
	{
		slug: 'usapho-1997',
		olympiad: 'usapho',
		label: 'USAPhO',
		year: 1997,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/usapho/1997.pdf'
	},
	{
		slug: 'bpho-r1-2020-1',
		olympiad: 'bpho-r1',
		label: 'BPhO R1',
		year: 2020,
		file: 'Section 1',
		url: 'https://cdn.phoxiv.org/olympiads/bpho-r1/2020_1.pdf'
	},
	{
		slug: 'sjpo-2015',
		olympiad: 'sjpo',
		label: 'SJPO',
		year: 2015,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/sjpo/2015.pdf'
	},
	{
		slug: 'upho-2025',
		olympiad: 'upho',
		label: 'UPhO',
		year: 2025,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/upho/2025.pdf'
	},
	{
		slug: 'inpho-2025-a',
		olympiad: 'inpho',
		label: 'InPhO',
		year: 2025,
		file: 'Answer Sheets',
		url: 'https://cdn.phoxiv.org/olympiads/inpho/2025_A.pdf'
	},
	{
		slug: 'cpho-f-2023',
		olympiad: 'cpho-f',
		label: 'CPhO Finals',
		year: 2023,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/cpho-f/2023.pdf'
	},
	{
		slug: 'kphc-2016',
		olympiad: 'kphc',
		label: 'KPhC',
		year: 2016,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/kphc/2016.pdf'
	},
	{
		slug: 'ortvay-2001',
		olympiad: 'ortvay',
		label: 'Ortvay',
		year: 2001,
		file: 'Problems',
		url: 'https://cdn.phoxiv.org/olympiads/ortvay/2001/problems.pdf'
	},
	{
		slug: 'rupho-y-2026-t3-s',
		olympiad: 'rupho-y',
		label: 'RuPhO (Y)',
		year: 2026,
		num: 'T3',
		file: 'Solution',
		url: 'https://cdn.phoxiv.org/olympiads/rupho-y/2026/T3_S.pdf'
	},
	{
		slug: 'wopho-2012-5-s',
		olympiad: 'wopho',
		label: 'WoPhO',
		year: 2012,
		num: '5',
		file: 'Solution',
		url: 'https://cdn.phoxiv.org/olympiads/wopho/2012/5/solution.pdf'
	}
];
