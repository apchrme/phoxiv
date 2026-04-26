import fs from 'fs';
import type { OlympiadEntry, FilesJson } from '../../types.js';
import { OUT } from '../utils.js';

export function genStats(olympiadsJson: OlympiadEntry[], filesOutput: FilesJson): void {
	const stats = {
		olympiads: olympiadsJson.length,
		years: Object.values(filesOutput).reduce((n, years) => n + years.length, 0),
		files: Object.values(filesOutput)
			.flat()
			.reduce((total, year) => {
				return (
					total +
					Object.keys(year.yearFiles).length +
					year.problems.reduce((n, p) => n + Object.keys(p.files).length, 0)
				);
			}, 0)
	};

	fs.writeFileSync(OUT.stats, JSON.stringify(stats, null, 2));
	console.log('Wrote ' + OUT.stats + ' (' + JSON.stringify(stats) + ')');
}
