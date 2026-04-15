/**
 * generate.ts — phoXiv pregeneration script
 *
 * Reads static/contests/ and produces JSON files consumed by the app at build time.
 *
 * Usage:
 *   bun run src/lib/pregen/generate.ts              # run all tasks
 *   bun run src/lib/pregen/generate.ts --contests   # contests.json only
 *   bun run src/lib/pregen/generate.ts --files      # files.json only
 *   bun run src/lib/pregen/generate.ts --stats      # stats.json only
 *   bun run src/lib/pregen/generate.ts --search     # searchIndex.json only
 *
 * Multiple flags can be combined:
 *   bun run src/lib/pregen/generate.ts --stats --search
 *
 * Adding a new contest: create static/contests/<id>/index.yaml with the
 * required fields (name, summary, icon, tag). No other files need editing.
 *
 * Adding problem titles or year notes: create/edit
 *   static/contests/<id>/<year>/index.yaml
 */

import { readContests } from './tasks/readContests.js';
import { genContests } from './tasks/genContests.js';
import { genFiles } from './tasks/genFiles.js';
import { genStats } from './tasks/genStats.js';
import { genSearchIndex } from './tasks/genSearchIndex.js';

// ── Flag parsing ──────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));

const runAll = args.size === 0;
const runContests = runAll || args.has('--contests');
const runFiles = runAll || args.has('--files');
const runStats = runAll || args.has('--stats');
const runSearch = runAll || args.has('--search');

// ── Dependency resolution ─────────────────────────────────────────────────────
//
// Dependency graph:
//
//   readContests
//       ├── genContests
//       └── genFiles
//               ├── genStats
//               └── genSearchIndex
//
// Each step is only executed if at least one task that depends on it is active.

const needContestData = runContests || runFiles || runStats || runSearch;
const needFilesData = runFiles || runStats || runSearch;

// ── Orchestration ─────────────────────────────────────────────────────────────

const internalContests = needContestData ? readContests() : null;
const contestsJson = runContests && internalContests ? genContests(internalContests) : null;
const filesOutput = needFilesData && internalContests ? genFiles(internalContests) : null;

if (runStats) {
	if (!contestsJson || !filesOutput) throw new Error('--stats requires contest and file data');
	genStats(contestsJson, filesOutput);
}

if (runSearch) {
	if (!internalContests || !filesOutput) throw new Error('--search requires contest and file data');
	genSearchIndex(internalContests, filesOutput);
}
