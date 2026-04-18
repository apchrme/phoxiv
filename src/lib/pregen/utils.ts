import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { FileType } from './fileTypes.js';
import type { FileTypeLabel } from './types.js';

// ── Config ────────────────────────────────────────────────────────────────────

export const STATIC_DIR = path.resolve('static/olympiads');
export const EXTENSIONS = ['pdf', 'xlsx', 'zip', 'htm', 'html', 'doc', 'docx'];
export const PROBLEM_NUMS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'E1', 'E2', 'PE', 'PE+', 'PE1', 'PE2', 'PE3'];

export const OUT = {
	olympiads: path.resolve('src/lib/pregen/output/olympiads.json'),
	files: path.resolve('src/lib/pregen/output/files.json'),
	stats: path.resolve('src/lib/pregen/output/stats.json'),
	searchIndex: path.resolve('src/lib/pregen/output/searchIndex.json')
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function readYaml<T>(filePath: string): T | null {
	if (!fs.existsSync(filePath)) return null;
	try {
		return (yaml.load(fs.readFileSync(filePath, 'utf8')) as T) ?? null;
	} catch (e) {
		console.warn('  Could not parse ' + filePath + ':', e);
		return null;
	}
}

export function findFile(entries: string[], base: string): string | null {
	for (const ext of EXTENSIONS) {
		const name = base + '.' + ext;
		if (entries.includes(name)) return name;
	}
	return null;
}

export function resolveLinks(
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

export function toLabels(types: Record<string, FileType>): Record<string, FileTypeLabel> {
	const out: Record<string, FileTypeLabel> = {};
	for (const [k, v] of Object.entries(types)) out[k] = { label: v.label };
	return out;
}
