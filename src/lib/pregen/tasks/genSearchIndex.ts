import fs from 'fs';
import type { FilesJson, SearchIndexItem, SearchIndex } from '../types.js';
import { OUT } from '../utils.js';
import type { InternalOlympiad } from './readOlympiads.js';

export function genSearchIndex(internalOlympiads: InternalOlympiad[], filesOutput: FilesJson): void {
	const olympiadMeta: SearchIndex["olympiadMeta"] = {};

	for (const olympiad of internalOlympiads) {
		olympiadMeta[olympiad.id] = {
			name: olympiad.name,
			icon: olympiad.icon,
			probFTEntries: Object.entries(olympiad.problemFileTypes)
		};
	}

	const items: SearchIndexItem[] = [];
	for (const olympiad of internalOlympiads) {
		for (const yearEntry of filesOutput[olympiad.id] ?? []) {
			for (const problem of yearEntry.problems) {
				items.push({
					olympiadId: olympiad.id,
					year: yearEntry.year,
					problem,
					searchText: [
						olympiad.id,
						olympiad.name,
						String(yearEntry.year),
						problem.number,
						problem.title ?? ''
					]
						.join(' ')
						.toLowerCase()
				});
			}
		}
	}

	fs.writeFileSync(OUT.searchIndex, JSON.stringify({ olympiadMeta, items }, null, 2));
	console.log('Wrote ' + OUT.searchIndex + ' (' + items.length + ' items)');
}
