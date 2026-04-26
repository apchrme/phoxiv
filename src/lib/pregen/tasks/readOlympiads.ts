import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { yearFileTypes, problemFileTypes } from '../fileTypes.js';
import type { FileType } from '../fileTypes.js';
import type { OlympiadEntry, OlympiadIndexYaml, FileTypeLabel } from '../../types.js';
import { STATIC_DIR, readYaml, toLabels } from '../utils.js';

export type InternalOlympiad = OlympiadEntry & {
	_order: number;
	_yearTypes: Record<string, FileType>;
	_problemTypes: Record<string, FileType>;
};

export function readOlympiads(): InternalOlympiad[] {
	const olympiadDirs = fs
		.readdirSync(STATIC_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name);

	const olympiads: InternalOlympiad[] = [];

	for (const id of olympiadDirs) {
		const olympiadDir = path.join(STATIC_DIR, id);
		const meta = readYaml<OlympiadIndexYaml>(path.join(olympiadDir, 'index.yaml'));
		if (!meta) {
			console.warn('  No index.yaml for "' + id + '" — skipping');
			continue;
		}

		const mergedYear = { ...yearFileTypes, ...(meta.extraFileTypes?.year ?? {}) };
		const mergedProblem = { ...problemFileTypes, ...(meta.extraFileTypes?.problem ?? {}) };

		olympiads.push({
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

	olympiads.sort((a, b) =>
		a._order !== b._order ? a._order - b._order : a.id.localeCompare(b.id)
	);

	return olympiads;
}
