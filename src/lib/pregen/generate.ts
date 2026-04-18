/**
 * generate.ts — phoXiv pregeneration script
 *
 * Reads static/olympiads/ and produces JSON files consumed by the app at build time.
 *
 * Usage:
 *   bun run src/lib/pregen/generate.ts              # run all tasks
 *   bun run src/lib/pregen/generate.ts --olympiads   # olympiads.json only
 *   bun run src/lib/pregen/generate.ts --files      # files.json only
 *   bun run src/lib/pregen/generate.ts --stats      # stats.json only
 *   bun run src/lib/pregen/generate.ts --search     # searchIndex.json only
 *
 * Multiple flags can be combined:
 *   bun run src/lib/pregen/generate.ts --stats --search
 *
 * Adding a new olympiad: create static/olympiads/<id>/index.yaml with the
 * required fields (name, summary, icon, tag). No other files need editing.
 *
 * Adding problem titles or year notes: create/edit
 *   static/olympiads/<id>/<year>/index.yaml
 */

import { readOlympiads } from './tasks/readOlympiads.js';
import { genOlympiads } from './tasks/genOlympiads.js';
import { genFiles } from './tasks/genFiles.js';
import { genStats } from './tasks/genStats.js';
import { genSearchIndex } from './tasks/genSearchIndex.js';

// ── Flag parsing ──────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));

const runAll = args.size === 0;
const runOlympiads = runAll || args.has('--olympiads');
const runFiles = runAll || args.has('--files');
const runStats = runAll || args.has('--stats');
const runSearch = runAll || args.has('--search');

// ── Dependency resolution ─────────────────────────────────────────────────────
//
// Dependency graph:
//
//   readOlympiads
//       ├── genOlympiads
//       └── genFiles
//               ├── genStats
//               └── genSearchIndex
//
// Each step is only executed if at least one task that depends on it is active.

const needOlympiadData = runOlympiads || runFiles || runStats || runSearch;
const needFilesData = runFiles || runStats || runSearch;

// ── Orchestration ─────────────────────────────────────────────────────────────

const internalOlympiads = needOlympiadData ? readOlympiads() : null;
const olympiadsJson = runOlympiads && internalOlympiads ? genOlympiads(internalOlympiads) : null;
const filesOutput = needFilesData && internalOlympiads ? genFiles(internalOlympiads) : null;

if (runStats) {
	if (!olympiadsJson || !filesOutput) throw new Error('--stats requires olympiad and file data');
	genStats(olympiadsJson, filesOutput);
}

if (runSearch) {
	if (!internalOlympiads || !filesOutput) throw new Error('--search requires olympiad and file data');
	genSearchIndex(internalOlympiads, filesOutput);
}
