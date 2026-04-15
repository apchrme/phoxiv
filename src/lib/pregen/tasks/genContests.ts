import fs from 'fs';
import type { ContestEntry } from '../types.js';
import { OUT } from '../utils.js';
import type { InternalContest } from './readContests.js';

export function genContests(internalContests: InternalContest[]): ContestEntry[] {
	const contestsJson: ContestEntry[] = internalContests.map(
		({ _order, _yearTypes, _problemTypes, ...rest }) => rest
	);

	fs.writeFileSync(OUT.contests, JSON.stringify(contestsJson, null, 2));
	console.log('Wrote ' + OUT.contests + ' (' + contestsJson.length + ' contests)');

	return contestsJson;
}
