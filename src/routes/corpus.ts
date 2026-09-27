/**
 * The hand-picked files shown in the landing page's corpus band.
 *
 * Read by both `CorpusBand.svelte` and `$lib/server/thumbs-cli.ts`. To add one:
 * add an entry, run `bun run thumbs:render`, commit the PNG. See
 * docs/contributing.md, "The landing page's corpus band".
 *
 * Every `url` is copied from the production API, not constructed, so it
 * matches a real object.
 */
export type CorpusEntry = {
	/** Thumbnail filename stem: `src/lib/assets/thumbs/<slug>.png`. */
	slug: string;
	/** `olympiads.id`. */
	olympiad: string;
	/** The short name shown on the tile. */
	label: string;
	year: number;
	/** The problem number, for problem-level files. */
	num?: string;
	/** The file's label, as stored. */
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
