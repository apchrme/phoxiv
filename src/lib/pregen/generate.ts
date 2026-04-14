/**
 * generate.ts — phoXiv pregeneration script
 *
 * Reads static/contests/ and produces:
 *   - src/lib/pregen/contests.json   (contest metadata + merged file type labels)
 *   - src/lib/pregen/files.json      (all file links per contest/year/problem)
 *   - src/lib/pregen/stats.json      (statistics that appear on the landing page)
 *
 * Adding a new contest: create static/contests/<id>/index.yaml with the
 * required fields (name, summary, icon, tag). No other files need editing.
 *
 * Adding problem titles or year notes: create/edit
 *   static/contests/<id>/<year>/index.yaml
 *
 * Run with:  bun run src/lib/pregen/generate.ts
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { marked } from 'marked';
import { yearFileTypes, problemFileTypes } from './fileTypes.js';
import type { FileType } from './fileTypes.js';
import type {
	ContestEntry,
	ContestIndexYaml,
	YearIndexYaml,
	YearEntry,
	ProblemEntry,
	FilesJson,
	FileTypeLabel
} from './types.js';

// ── Config ────────────────────────────────────────────────────────────────────

const STATIC_DIR = path.resolve('static/contests');
const CONTESTS_OUT = path.resolve('src/lib/pregen/contests.json');
const FILES_OUT = path.resolve('src/lib/pregen/files.json');
const EXTENSIONS = ['pdf', 'xlsx', 'zip', 'htm', 'html', 'doc', 'docx'];
const PROBLEM_NUMS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'E1', 'E2', 'PE'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function readYaml<T>(filePath: string): T | null {
	if (!fs.existsSync(filePath)) return null;
	try {
		return (yaml.load(fs.readFileSync(filePath, 'utf8')) as T) ?? null;
	} catch (e) {
		console.warn('  Could not parse ' + filePath + ':', e);
		return null;
	}
}

function findFile(entries: string[], base: string): string | null {
	for (const ext of EXTENSIONS) {
		const name = base + '.' + ext;
		if (entries.includes(name)) return name;
	}
	return null;
}

function resolveLinks(
	entries: string[],
	base: string,
	types: Record<string, FileType>,
	urlPrefix: string
): Record<string, string> {
	const links: Record<string, string> = {};
	for (const [key, ft] of Object.entries(types)) {
		const found = findFile(entries, base + ft.suffix);
		if (found) links[key] = urlPrefix + '/' + found;
	}
	return links;
}

function toLabels(types: Record<string, FileType>): Record<string, FileTypeLabel> {
	const out: Record<string, FileTypeLabel> = {};
	for (const [k, v] of Object.entries(types)) out[k] = { label: v.label };
	return out;
}

// ── Read contest index.yaml files ─────────────────────────────────────────────

type InternalContest = ContestEntry & {
	_order: number;
	_yearTypes: Record<string, FileType>;
	_problemTypes: Record<string, FileType>;
};

const contestDirs = fs
	.readdirSync(STATIC_DIR, { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

const internalContests: InternalContest[] = [];

for (const id of contestDirs) {
	const contestDir = path.join(STATIC_DIR, id);
	const meta = readYaml<ContestIndexYaml>(path.join(contestDir, 'index.yaml'));
	if (!meta) {
		console.warn('  No index.yaml for "' + id + '" — skipping');
		continue;
	}

	const extraYear = meta.extraFileTypes?.year ?? {};
	const extraProblem = meta.extraFileTypes?.problem ?? {};
	const mergedYear = { ...yearFileTypes, ...extraYear };
	const mergedProblem = { ...problemFileTypes, ...extraProblem };

	internalContests.push({
		id,
		name: meta.name,
		summary: meta.summary,
		icon: meta.icon,
		tag: meta.tag,
		yearFileTypes: toLabels(mergedYear),
		problemFileTypes: toLabels(mergedProblem),
		description: meta.description,
		descriptionHtml: meta.description ? (marked.parse(meta.description) as string) : undefined,
		_order: meta.order ?? Infinity,
		_yearTypes: mergedYear,
		_problemTypes: mergedProblem
	});
}

internalContests.sort((a, b) =>
	a._order !== b._order ? a._order - b._order : a.id.localeCompare(b.id)
);

// Write contests.json
const contestsJson: ContestEntry[] = internalContests.map(
	({ _order, _yearTypes, _problemTypes, ...rest }) => rest
);
fs.writeFileSync(CONTESTS_OUT, JSON.stringify(contestsJson, null, 2));
console.log('Wrote ' + CONTESTS_OUT + ' (' + contestsJson.length + ' contests)');

// ── Scan files and build files.json ──────────────────────────────────────────

const filesOutput: FilesJson = {};

for (const contest of internalContests) {
	const contestDir = path.join(STATIC_DIR, contest.id);
	const contestEntries = fs.readdirSync(contestDir);

	// console.log('\n' + contest.id + ':');

	const yearNumbers = new Set<number>();
	for (const entry of contestEntries) {
		const n = parseInt(entry, 10);
		if (!isNaN(n) && !entry.includes('.')) yearNumbers.add(n);
		const m = entry.match(/^(\d{4})[_.]/);
		if (m) yearNumbers.add(parseInt(m[1], 10));
	}

	const years: YearEntry[] = [];

	for (const year of [...yearNumbers].sort((a, b) => b - a)) {
		const yearDir = path.join(contestDir, String(year));
		const hasDir = fs.existsSync(yearDir);
		const yearEntries = hasDir ? fs.readdirSync(yearDir) : [];
		const meta: YearIndexYaml = hasDir
			? (readYaml<YearIndexYaml>(path.join(yearDir, 'index.yaml')) ?? {})
			: {};

		const yearFiles = resolveLinks(
			contestEntries,
			String(year),
			contest._yearTypes,
			'/contests/' + contest.id
		);

		const problems: ProblemEntry[] = [];
		for (const num of PROBLEM_NUMS) {
			const files = resolveLinks(
				yearEntries,
				num,
				contest._problemTypes,
				'/contests/' + contest.id + '/' + year
			);
			const title = meta.problems?.[num]?.title;
			if (Object.keys(files).length === 0 && !title) continue;
			problems.push({ number: num, ...(title ? { title } : {}), files });
		}

		if (Object.keys(yearFiles).length === 0 && problems.length === 0) continue;

		years.push({
			year,
			notes: meta.notes ?? [],
			extraLinks: meta.extraLinks ?? [],
			yearFiles,
			problems
		});

		const parts = [
			problems.length ? problems.length + ' problems' : null,
			Object.keys(yearFiles).length ? Object.keys(yearFiles).length + ' year files' : null,
			meta.notes?.length ? meta.notes.length + ' note(s)' : null,
			meta.extraLinks?.length ? meta.extraLinks.length + ' extra link(s)' : null
		].filter(Boolean);
		// console.log('  ' + year + ': ' + (parts.join(', ') || 'empty'));
	}

	filesOutput[contest.id] = years;
}

fs.writeFileSync(FILES_OUT, JSON.stringify(filesOutput, null, 2));
console.log('\nWrote ' + FILES_OUT);

// ── Write stats.json ──────────────────────────────────────────────────────────

const stats = {
	contests: contestsJson.length,
	years: Object.values(filesOutput).reduce((n, years) => n + years.length, 0),
	files: Object.values(filesOutput).flat().reduce((total, year) => {
		return (
			total +
			Object.keys(year.yearFiles).length +
			year.problems.reduce((n, p) => n + Object.keys(p.files).length, 0)
		);
	}, 0),
};

const STATS_OUT = path.resolve('src/lib/pregen/stats.json');
fs.writeFileSync(STATS_OUT, JSON.stringify(stats, null, 2));
console.log('Wrote ' + STATS_OUT + ' (' + JSON.stringify(stats) + ')');

