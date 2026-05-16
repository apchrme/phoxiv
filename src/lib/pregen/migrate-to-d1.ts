import fs from 'fs';
import path from 'path';
import type { OlympiadEntry, FilesJson } from './types_old.js';

const olympiads: OlympiadEntry[] = JSON.parse(
	fs.readFileSync(path.resolve('src/lib/pregen/output/olympiads.json'), 'utf8')
);
const files: FilesJson = JSON.parse(
	fs.readFileSync(path.resolve('src/lib/pregen/output/files.json'), 'utf8')
);

// R2 CDN base — must match your actual CDN URL
const CDN_BASE = 'https://cdn.phoxiv.org/';

const lines: string[] = ['PRAGMA foreign_keys = ON;'];

// Escape a value for SQL
function s(v: string | null | undefined): string {
	if (v == null) return 'NULL';
	return `'${v.replace(/'/g, "''")}'`;
}

function j(v: unknown): string {
	return s(JSON.stringify(v));
}

// Rewrite a root-relative URL to a full CDN URL.
// Current URLs look like '/olympiads/ipho/2025/T1.pdf'.
// If they already look like a full URL (someone ran pregen with FILES_BASE_URL set), leave them.
function toCdnUrl(url: string): string {
	if (url.startsWith('http')) return url;
	return CDN_BASE + url;
}

// olympiads
for (const [i, o] of olympiads.entries()) {
	lines.push(
		`INSERT INTO olympiads (id, name, summary, icon, tag, display_order, description_md, description_html, year_file_types, problem_file_types) VALUES (${s(o.id)}, ${s(o.name)}, ${s(o.summary)}, ${s(o.icon ?? '')}, ${s(o.tag)}, ${i}, ${s(o.description)}, ${s(o.descriptionHtml)}, ${j(o.yearFileTypes)}, ${j(o.problemFileTypes)});`
	);
}

// years, year_files, problems, problem_files
// Use explicit integer IDs so we don't need last_insert_rowid() across statements.
let yearId = 1;
let problemId = 1;

for (const o of olympiads) {
	for (const year of files[o.id] ?? []) {
		lines.push(
			`INSERT INTO years (id, olympiad_id, year, notes, extra_links) VALUES (${yearId}, ${s(o.id)}, ${year.year}, ${j(year.notes)}, ${j(year.extraLinks)});`
		);

		for (const [fileType, url] of Object.entries(year.yearFiles)) {
			lines.push(
				`INSERT INTO year_files (year_id, file_type, url) VALUES (${yearId}, ${s(fileType)}, ${s(toCdnUrl(url))});`
			);
		}

		for (const problem of year.problems) {
			lines.push(
				`INSERT INTO problems (id, year_id, number, title) VALUES (${problemId}, ${yearId}, ${s(problem.number)}, ${s(problem.title)});`
			);

			for (const [fileType, url] of Object.entries(problem.files)) {
				lines.push(
					`INSERT INTO problem_files (problem_id, file_type, url) VALUES (${problemId}, ${s(fileType)}, ${s(toCdnUrl(url))});`
				);
			}

			problemId++;
		}

		yearId++;
	}
}

const sql = lines.join('\n');
const outPath = path.resolve('src/lib/server/db/seed.sql');
fs.writeFileSync(outPath, sql);
console.log(
	`Wrote ${outPath} (${lines.length} statements, ${yearId - 1} years, ${problemId - 1} problems)`
);
