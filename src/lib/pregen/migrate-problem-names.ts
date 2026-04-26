/**
 * migrate-problem-names.ts
 *
 * One-off migration script. Reads src/lib/pregen/problemNames.csv and writes
 * problem titles into the appropriate static/olympiads/<id>/<year>/index.yaml
 * files, merging with any content that already exists there.
 *
 * Safe to re-run — existing notes/extraLinks are preserved.
 *
 * Run with:  bun run src/lib/pregen/migrate-problem-names.ts
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import yaml from 'js-yaml';
import type { YearIndexYaml } from '../types.js';

const CSV_PATH = path.resolve('src/lib/pregen/problemTitles.csv');
const STATIC_DIR = path.resolve('static/olympiads');

// ── Read CSV ──────────────────────────────────────────────────────────────────

const csvText = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parse(csvText, { columns: true, trim: true, skip_empty_lines: true }) as Record<
	string,
	string
>[];

// Columns other than 'olympiad' and 'year' are problem numbers
const header = Object.keys(rows[0]);
const problemColumns = header.filter((h) => h !== 'olympiad' && h !== 'year');

let written = 0;
let skipped = 0;

for (const row of rows) {
	const olympiadId = row['olympiad'];
	const year = row['year'];

	if (!olympiadId || !year) continue;

	// Collect non-empty titles from this row
	const titles: Record<string, string> = {};
	for (const col of problemColumns) {
		const title = row[col]?.trim();
		if (title) titles[col] = title;
	}

	if (Object.keys(titles).length === 0) {
		skipped++;
		continue;
	}

	const yearDir = path.join(STATIC_DIR, olympiadId, year);
	const yamlPath = path.join(yearDir, 'index.yaml');

	// Read existing index.yaml if present, so we don't clobber notes/extraLinks
	let existing: YearIndexYaml = {};
	if (fs.existsSync(yamlPath)) {
		try {
			existing = (yaml.load(fs.readFileSync(yamlPath, 'utf8')) as YearIndexYaml) ?? {};
		} catch {
			console.warn(`  ⚠ Could not parse existing ${yamlPath} — will overwrite`);
		}
	}

	// Merge titles into the problems section
	const mergedProblems: Record<string, { title: string }> = {};
	for (const [num, title] of Object.entries(titles)) {
		mergedProblems[num] = { title };
	}
	// Preserve any existing problem entries not in the CSV (e.g. added manually)
	for (const [num, entry] of Object.entries(existing.problems ?? {})) {
		if (!mergedProblems[num]) mergedProblems[num] = entry as { title: string };
	}

	const updated: YearIndexYaml = {
		...(existing.notes ? { notes: existing.notes } : {}),
		...(existing.extraLinks ? { extraLinks: existing.extraLinks } : {}),
		problems: mergedProblems
	};

	fs.mkdirSync(yearDir, { recursive: true });
	fs.writeFileSync(yamlPath, yaml.dump(updated, { lineWidth: 120 }));
	console.log(`  ✓ ${olympiadId}/${year} — ${Object.keys(mergedProblems).length} problem(s)`);
	written++;
}

console.log(
	`\nDone. Wrote ${written} index.yaml file(s), skipped ${skipped} row(s) with no titles.`
);
