## Schema

```sql
-- src/lib/server/db/migrations/0000.sql

CREATE TABLE olympiads (
    id                  TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    summary             TEXT NOT NULL,
    icon                TEXT NOT NULL DEFAULT '',
    tag                 TEXT NOT NULL CHECK(tag IN ('International', 'Regional', 'National', 'Open')),
    display_order       INTEGER NOT NULL DEFAULT 9999,
    description_md      TEXT,
    description_html    TEXT,
    -- stored as JSON objects: Record<string, { label: string }>
    year_file_types     TEXT NOT NULL DEFAULT '{}',
    problem_file_types  TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE years (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    olympiad_id TEXT    NOT NULL REFERENCES olympiads(id) ON DELETE CASCADE,
    year        INTEGER NOT NULL,
    notes       TEXT    NOT NULL DEFAULT '[]',  -- JSON: string[]
    extra_links TEXT    NOT NULL DEFAULT '[]',  -- JSON: { label: string, url: string }[]
    UNIQUE(olympiad_id, year)
);

CREATE TABLE year_files (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    year_id   INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
    file_type TEXT    NOT NULL,  -- e.g. 'problems', 'theorySolutions'
    url       TEXT    NOT NULL,
    UNIQUE(year_id, file_type)
);

CREATE TABLE problems (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    year_id INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
    number  TEXT    NOT NULL,  -- e.g. 'T1', 'E2'
    title   TEXT,
    UNIQUE(year_id, number)
);

CREATE TABLE problem_files (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    problem_id INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    file_type  TEXT    NOT NULL,  -- e.g. 'problem', 'solution', 'markingScheme'
    url        TEXT    NOT NULL,
    UNIQUE(problem_id, file_type)
);
```

A few design notes:

- `year_file_types` and `problem_file_types` are stored as JSON columns on `olympiads` rather than a separate table because they're configuration that is always read as a unit alongside the olympiad, never queried individually
- URLs are stored in full (e.g. `https://cdn.phoxiv.org/olympiads/ipho/2025/T1.pdf`) rather than as paths, because the upload action knows the CDN URL at write time and it removes the need to reconstruct URLs at query time
- `ON DELETE CASCADE` throughout so deleting an olympiad or year cleans up all its children automatically

---

## Migration script

This reads from your existing `olympiads.json` and `files.json` output files (which are still in the repo) and generates a SQL seed file you can pipe to D1.

```typescript
// src/lib/pregen/migrate-to-d1.ts
import fs from 'fs';
import path from 'path';
import type { OlympiadEntry, FilesJson } from './types.js';

const olympiads: OlympiadEntry[] = JSON.parse(
    fs.readFileSync(path.resolve('src/lib/pregen/output/olympiads.json'), 'utf8')
);
const files: FilesJson = JSON.parse(
    fs.readFileSync(path.resolve('src/lib/pregen/output/files.json'), 'utf8')
);

// R2 CDN base — must match your actual CDN URL
const CDN_BASE = process.env.FILES_BASE_URL?.replace(/\/$/, '') ?? '';

if (!CDN_BASE) {
    console.error('FILES_BASE_URL is not set. Run with FILES_BASE_URL=https://cdn.phoxiv.org bun run src/lib/pregen/migrate-to-d1.ts');
    process.exit(1);
}

const lines: string[] = ['PRAGMA foreign_keys = ON;', 'BEGIN TRANSACTION;'];

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

lines.push('COMMIT;');

const sql = lines.join('\n');
const outPath = path.resolve('seed.sql');
fs.writeFileSync(outPath, sql);
console.log(`Wrote ${outPath} (${lines.length} statements, ${yearId - 1} years, ${problemId - 1} problems)`);
```

Add the script to `package.json`:

```json
"migrate:d1": "FILES_BASE_URL=https://cdn.phoxiv.org bun run src/lib/pregen/migrate-to-d1.ts"
```

Then run:

```sh
# Generate the schema migration
wrangler d1 migrations apply DB

# Generate and apply the seed data
bun run migrate:d1
wrangler d1 execute DB --file=seed.sql

# For production
wrangler d1 execute DB --file=seed.sql --remote
```
