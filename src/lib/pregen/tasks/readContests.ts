import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { yearFileTypes, problemFileTypes } from '../fileTypes.js';
import type { FileType } from '../fileTypes.js';
import type { ContestEntry, ContestIndexYaml, FileTypeLabel } from '../types.js';
import { STATIC_DIR, readYaml, toLabels } from '../utils.js';

export type InternalContest = ContestEntry & {
	_order: number;
	_yearTypes: Record<string, FileType>;
	_problemTypes: Record<string, FileType>;
};

export function readContests(): InternalContest[] {
	const contestDirs = fs
		.readdirSync(STATIC_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	const contests: InternalContest[] = [];

	for (const id of contestDirs) {
		const contestDir = path.join(STATIC_DIR, id);
		const meta = readYaml<ContestIndexYaml>(path.join(contestDir, 'index.yaml'));
		if (!meta) {
			console.warn('  No index.yaml for "' + id + '" — skipping');
			continue;
		}

		const mergedYear = { ...yearFileTypes, ...(meta.extraFileTypes?.year ?? {}) };
		const mergedProblem = { ...problemFileTypes, ...(meta.extraFileTypes?.problem ?? {}) };

		contests.push({
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

	contests.sort((a, b) => (a._order !== b._order ? a._order - b._order : a.id.localeCompare(b.id)));

	return contests;
}
