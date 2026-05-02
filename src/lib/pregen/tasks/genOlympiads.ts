import fs from 'fs';
import type { OlympiadEntry } from '../types_old.js';
import { OUT } from '../utils.js';
import type { InternalOlympiad } from './readOlympiads.js';

export function genOlympiads(internalOlympiads: InternalOlympiad[]): OlympiadEntry[] {
	const olympiadsJson: OlympiadEntry[] = internalOlympiads.map(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		({ _order, _yearTypes, _problemTypes, ...rest }) => rest
	);

	fs.writeFileSync(OUT.olympiads, JSON.stringify(olympiadsJson, null, 2));
	console.log('Wrote ' + OUT.olympiads + ' (' + olympiadsJson.length + ' olympiads)');

	return olympiadsJson;
}
