import fs from 'fs';
import path from 'path';
import type { FilesJson, YearEntry, YearIndexYaml, ProblemEntry } from '../../types.js';
import { STATIC_DIR, PROBLEM_NUMS, OUT, readYaml, resolveLinks, FILES_BASE_URL } from '../utils.js';
import type { InternalOlympiad } from './readOlympiads.js';

export function genFiles(internalOlympiads: InternalOlympiad[]): FilesJson {
	const filesOutput: FilesJson = {};

	for (const olympiad of internalOlympiads) {
		const olympiadDir = path.join(STATIC_DIR, olympiad.id);
		const olympiadEntries = fs.readdirSync(olympiadDir);

		const yearNumbers = new Set<number>();
		for (const entry of olympiadEntries) {
			const n = parseInt(entry, 10);
			if (!isNaN(n) && !entry.includes('.')) yearNumbers.add(n);
			const m = entry.match(/^(\d{4})[_.]/);
			if (m) yearNumbers.add(parseInt(m[1], 10));
		}

		const years: YearEntry[] = [];

		for (const year of [...yearNumbers].sort((a, b) => b - a)) {
			const yearDir = path.join(olympiadDir, String(year));
			const hasDir = fs.existsSync(yearDir);
			const yearEntries = hasDir ? fs.readdirSync(yearDir) : [];
			const meta: YearIndexYaml = hasDir
				? (readYaml<YearIndexYaml>(path.join(yearDir, 'index.yaml')) ?? {})
				: {};

			const yearFiles = resolveLinks(
				olympiadEntries,
				String(year),
				olympiad._yearTypes,
				FILES_BASE_URL + '/olympiads/' + olympiad.id // base URL links to the CDN
			);

			const problems: ProblemEntry[] = [];
			for (const num of PROBLEM_NUMS) {
				const files = resolveLinks(
					yearEntries,
					num,
					olympiad._problemTypes,
					FILES_BASE_URL + '/olympiads/' + olympiad.id + '/' + year // base URL links to the CDN
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
		}

		filesOutput[olympiad.id] = years;
	}

	fs.writeFileSync(OUT.files, JSON.stringify(filesOutput, null, 2));
	console.log('Wrote ' + OUT.files);

	return filesOutput;
}
