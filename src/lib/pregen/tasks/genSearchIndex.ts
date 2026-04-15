import fs from 'fs';
import type { FilesJson, FileTypeLabel, SearchIndexItem } from '../types.js';
import { OUT } from '../utils.js';
import type { InternalContest } from './readContests.js';

export function genSearchIndex(internalContests: InternalContest[], filesOutput: FilesJson): void {
	const contestMeta: Record<
		string,
		{
			name: string;
			icon: string;
			probFTEntries: [string, FileTypeLabel][];
		}
	> = {};

	for (const contest of internalContests) {
		contestMeta[contest.id] = {
			name: contest.name,
			icon: contest.icon,
			probFTEntries: Object.entries(contest.problemFileTypes)
		};
	}

	const items: SearchIndexItem[] = [];
	for (const contest of internalContests) {
		for (const yearEntry of filesOutput[contest.id] ?? []) {
			for (const problem of yearEntry.problems) {
				items.push({
					contestId: contest.id,
					year: yearEntry.year,
					problem,
					searchText: [
						contest.id,
						contest.name,
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

	fs.writeFileSync(OUT.searchIndex, JSON.stringify({ contestMeta, items }, null, 2));
	console.log('Wrote ' + OUT.searchIndex + ' (' + items.length + ' items)');
}
