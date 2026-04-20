import fs from 'fs';
import type { FilesJson, SearchItem } from '../types.js';
import { OUT } from '../utils.js';
import type { InternalOlympiad } from './readOlympiads.js';

export function genSearchIndex(
    internalOlympiads: InternalOlympiad[],
    filesOutput: FilesJson
): void {
    const items: SearchItem[] = [];

    for (const olympiad of internalOlympiads) {
        const probFTEntries = Object.entries(olympiad.problemFileTypes);
        for (const yearEntry of filesOutput[olympiad.id] ?? []) {
            for (const problem of yearEntry.problems) {
                items.push({
                    olympiadId: olympiad.id,
                    olympiadName: olympiad.name,
                    olympiadIcon: olympiad.icon,
                    year: yearEntry.year,
                    problem,
                    probFTEntries,
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

    fs.writeFileSync(OUT.searchIndex, JSON.stringify(items, null, 2));
    console.log('Wrote ' + OUT.searchIndex + ' (' + items.length + ' items)');
}