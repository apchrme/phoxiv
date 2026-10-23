import type {
	activityLog,
	fileText,
	olympiads,
	problemFiles,
	problemProgress,
	problems,
	session,
	user,
	yearFiles,
	years
} from '../../../src/lib/server/db/schema';
import { CDN_BASE_URL } from '../../../src/lib/constants';
import { SUPERADMIN_EMAIL } from '../support/env';

/*
 * Everything the e2e database starts with. `prepare.ts` inserts it into an empty,
 * freshly migrated database on every server start. Typed against `schema.ts`, so
 * a schema change that breaks the seed fails `bun run check`.
 *
 * Each row belongs to one class (docs/testing.md, "Seed data"):
 * - frozen: read by many specs, written by none;
 * - owned: written by exactly one spec file, named in a comment;
 * - per-test: rows a test creates itself, under an id unique to that test;
 * - global: written by the index spec only (the FTS index), in its own project.
 *
 * No spec asserts a global total, but a few read a position or a count, so a
 * new row can still break one. Keep `USERS` under the users table's page size of
 * 25 (admin/users finds its rows on page 1), keep ORPHAN_URL the only `file_text`
 * row with no file (admin/index-panel expects "Removed 1"), and keep the frozen
 * olympiads first in display order, so their problems stay in ⌘K's first 50
 * (search/problem-filters).
 */

type Olympiad = typeof olympiads.$inferInsert;
type Year = typeof years.$inferInsert;
type Problem = typeof problems.$inferInsert;
type YearFile = typeof yearFiles.$inferInsert;
type ProblemFile = typeof problemFiles.$inferInsert;
type FileText = typeof fileText.$inferInsert;
type User = typeof user.$inferInsert;
type Session = typeof session.$inferInsert;
type Progress = typeof problemProgress.$inferInsert;
type ActivityLog = typeof activityLog.$inferInsert;

// ── Users ───────────────────────────────────────────────────────────────────

/** One seeded account. `session` controls the session row the tests sign in with. */
export type SeedUser = {
	id: string;
	name: string;
	email: string;
	role: 'admin' | 'contributor' | 'user' | null;
	assignedOlympiads?: string[];
	/** Set directly, as a ban by hand in SQL would be: the sessions are kept. */
	banned?: boolean;
	/**
	 * `fresh` (the default): valid for 7 days, no refresh due.
	 * `stale`: 5 days left, so BetterAuth refreshes it on the first lookup
	 * (`expiresAt - expiresIn + updateAge <= now`) and re-issues the cookie.
	 * `none`: no session, for accounts that are only ever a target.
	 */
	session?: 'fresh' | 'stale' | 'none';
};

/**
 * Every seeded account, by the key specs use (`test.use({ role: 'admin' })`,
 * `as('contributor')`). docs/testing.md has the owner of each.
 */
export const USERS = {
	/** frozen. The admin most specs act as. Never a target. */
	admin: { id: 'e2e-admin', name: 'Ada Admin', email: 'admin@e2e.test', role: 'admin' },
	/** frozen. The `SUPERADMIN_EMAIL` account: a target only. */
	superadmin: {
		id: 'e2e-superadmin',
		name: 'Sam Superadmin',
		email: SUPERADMIN_EMAIL,
		role: 'admin',
		session: 'none'
	},
	/** frozen. Assigned to `e2e-assigned` only. */
	contributor: {
		id: 'e2e-contributor',
		name: 'Cora Contributor',
		email: 'contributor@e2e.test',
		role: 'contributor',
		assignedOlympiads: ['e2e-assigned']
	},
	/** frozen. A plain signed-in visitor. */
	user: { id: 'e2e-user', name: 'Uma User', email: 'user@e2e.test', role: null },
	/**
	 * frozen. A contributor banned by hand in SQL: `banned` set, sessions kept.
	 * The hook and `/api/auth/*` must both treat this session as signed out.
	 */
	banned: {
		id: 'e2e-banned',
		name: 'Bo Banned',
		email: 'banned@e2e.test',
		role: 'contributor',
		assignedOlympiads: ['e2e-assigned'],
		banned: true
	},
	/** owned by http/cache-headers.spec.ts: its first page request uses up the refresh. */
	stale: {
		id: 'e2e-stale',
		name: 'Stu Stale',
		email: 'stale@e2e.test',
		role: null,
		session: 'stale'
	},
	/** owned by admin/users.spec.ts: promoted through the role select. */
	roleTarget: {
		id: 'e2e-role-target',
		name: 'Rex Target',
		email: 'role-target@e2e.test',
		role: null
	},
	/** owned by admin/users.spec.ts: the submit-loop regression changes its role. */
	loopTarget: {
		id: 'e2e-loop-target',
		name: 'Lou Loop',
		email: 'loop-target@e2e.test',
		role: null,
		session: 'none'
	},
	/** owned by auth/ban.spec.ts: banned through the admin panel while signed in. */
	banTarget: {
		id: 'e2e-ban-target',
		name: 'Bea Bannable',
		email: 'ban-target@e2e.test',
		role: 'contributor',
		assignedOlympiads: ['e2e-assigned']
	},
	/**
	 * owned by auth/ban.spec.ts: seeded banned with its session kept, then
	 * unbanned through the admin panel, after which that session works again.
	 */
	unbanTarget: {
		id: 'e2e-unban-target',
		name: 'Una Unbanned',
		email: 'unban-target@e2e.test',
		role: null,
		banned: true
	},
	/**
	 * owned by auth/ban.spec.ts: the target of a direct call to BetterAuth's admin
	 * endpoints, which must be closed. Owned, not frozen, because before that fix
	 * the call succeeded and changed the row.
	 */
	apiTarget: {
		id: 'e2e-api-target',
		name: 'Abe Api',
		email: 'api-target@e2e.test',
		role: null,
		session: 'none'
	},
	/** owned by olympiads/progress.spec.ts: marks alpha's problems done. */
	tracker: {
		id: 'e2e-tracker',
		name: 'Tess Tracker',
		email: 'tracker@e2e.test',
		role: null
	},

	// ── admin/users-table.spec.ts ──
	/**
	 * owned by admin/users-table.spec.ts: a contributor seeded with `alpha` only,
	 * whose assignments the admin panel replaces with `beta` and `delta`. Signs in
	 * before and after, to show the change reaches the guard.
	 */
	assignTarget: {
		id: 'e2e-ut-assign-target',
		name: 'Ari Assignee',
		email: 'assign-target@e2e.test',
		role: 'contributor',
		assignedOlympiads: ['alpha']
	},
	// olympiads/progress-filters.spec.ts
	/**
	 * owned by olympiads/progress-filters.spec.ts, which only reads it: seeded
	 * progress on alpha (in `seedRows`) that the status filter is checked
	 * against. No test tracks anything as this user, so the lists are known.
	 */
	progressReader: {
		id: 'e2e-pf-reader',
		name: 'Pip Reader',
		email: 'pf-reader@e2e.test',
		role: null
	},
	/**
	 * owned by olympiads/progress-filters.spec.ts: tracks alpha's problems while
	 * its progress request is held, for the race guard. No seeded progress; the
	 * test arranges its own through the action.
	 */
	progressRacer: {
		id: 'e2e-pf-racer',
		name: 'Rae Racer',
		email: 'pf-racer@e2e.test',
		role: null
	},
	// ── search/problem-filters.spec.ts ──
	/**
	 * owned by search/problem-filters.spec.ts, read only: seeded with the
	 * progress rows in `SEARCHER_PROGRESS`, which no test changes, so its "Done"
	 * list is exact.
	 */
	searcher: {
		id: 'e2e-sf-searcher',
		name: 'Sid Searcher',
		email: 'searcher@e2e.test',
		role: null
	}
} as const satisfies Record<string, SeedUser>;

/** A key of {@link USERS}. */
export type UserKey = keyof typeof USERS;

/** The raw session token of a seeded user. The cookie carries it signed. */
export function sessionToken(key: UserKey): string {
	// Any string works as a token; BetterAuth looks it up by equality. Padded so it
	// looks like a real one in a trace.
	return `e2e-session-token-${key}`.padEnd(32, '0');
}

// ── Users-table fillers: admin/users-table.spec.ts ──────────────────────────

/**
 * How many filler accounts admin/users-table.spec.ts owns: enough to give the
 * admin panel's users table (25 rows a page) a second page.
 */
const USERS_TABLE_FILLERS = 30;

/** The `n`th filler (1-based): "Filler User 07", `e2e-ut-filler-07@e2e.test`. */
export function usersTableFiller(n: number): { id: string; name: string; email: string } {
	const nn = String(n).padStart(2, '0');
	return {
		id: `e2e-ut-filler-${nn}`,
		name: `Filler User ${nn}`,
		email: `e2e-ut-filler-${nn}@e2e.test`
	};
}

/**
 * owned by admin/users-table.spec.ts. Plain users with no session, each joined a
 * minute after the one before and all after every {@link USERS} account. The
 * table sorts oldest first by default, so those accounts all stay on page 1,
 * where admin/users.spec.ts looks for them without searching, and the fillers
 * fill the rest of page 1 and page 2. A minute apart, so no tie in the sort
 * leaves which filler lands on which page to the engine.
 */
function usersTableFillerRows(now: Date): User[] {
	return Array.from({ length: USERS_TABLE_FILLERS }, (_, i) => ({
		...userRow({ ...usersTableFiller(i + 1), role: null }, now),
		createdAt: new Date(now.getTime() + (i + 1) * 60_000)
	}));
}

// ── Content ─────────────────────────────────────────────────────────────────

/** The CDN url for an R2 key, built as `storage.ts` builds it. */
function cdn(key: string): string {
	return `${CDN_BASE_URL}/${key}`;
}

/**
 * The olympiad the `setup` project looks for. If it is missing, the suite is not
 * talking to the server it seeded, so nothing else runs.
 */
export const SENTINEL_OLYMPIAD = 'e2e-sentinel';

/**
 * Distinctive search phrases. Each one is in the documents its comment names
 * and in no other seeded document; most are in exactly one.
 */
export const PHRASES = {
	/** alpha 2019, year-level problems PDF. */
	alphaPaper: 'zeppelin harmonic oscillator',
	/** alpha 2019 T1 solution. Its text also carries a literal `<script>` tag. */
	alphaSolution: 'quokka pendulum resonance',
	/** delta-w 2020 only: proves `?olympiad=delta` doesn't match `delta-w`. */
	deltaW: 'quasistatic wobble',
	/**
	 * In every one of delta-w's {@link DELTA_W_BULK} files: one more than
	 * DEEP_SEARCH_LIMIT, so a scope that leaked into delta-w would show as
	 * `truncated`. Also once in {@link BETA_BOOKLET} (beta), which ranks below
	 * them all.
	 */
	deltaWBulk: 'gyroscopic precession ladder',
	/**
	 * In `fixtures/files/text.pdf` and nowhere in the seed, so a hit proves an
	 * upload's text reached the index.
	 */
	textPdf: 'marmalade tachyon interferometer',
	// contribute/delete.spec.ts: in OWNED.delOlympiad's documents only. No word of
	// one is in any other document there, so the loose OR rung of a search for a
	// deleted file's phrase can't find another file instead.
	/** e2e-del 2001's year-level Problems and T1's Solution, both deleted by the spec. */
	delFile: 'ocelot bellows cantilever',
	/** e2e-del 2002's Problems, deleted and then replaced by `fixtures/files/text.pdf`. */
	delReplaced: 'armadillo theodolite ratchet',
	/** e2e-del 2003's year-level Problems and T1's Solution, deleted with the year. */
	delYear: 'tapir astrolabe gimbal',
	/**
	 * In e2e-del 2001's two deleted files and in every one of the witness year's
	 * {@link DEL_WITNESSES} files. A scoped search counts `file_text` rows, not
	 * files, so it is `truncated` while either deleted file's row is left.
	 */
	delFileCount: 'quetzal manometer',
	/** As `delFileCount`, for e2e-del 2003's two files, which go with the year. */
	delYearCount: 'axolotl pantograph'
} as const;

/** frozen. A `<script>` tag inside indexed text, which must render as text. */
export const SCRIPT_IN_TEXT = '<script>alert(1)</script>';

/** frozen. A problem title that is an XSS payload, which must render as text. */
export const XSS_TITLE = '<img src=x onerror=alert(1)>';

const OLYMPIADS: Olympiad[] = [
	{
		id: SENTINEL_OLYMPIAD,
		name: 'E2E Sentinel Olympiad',
		summary: 'Exists only in the e2e database.',
		icon: '🧪',
		tag: 'Open',
		displayOrder: 9000
	},
	{
		id: 'alpha',
		name: 'Alpha Physics Olympiad',
		summary: 'The main frozen olympiad.',
		icon: '🅰️',
		tag: 'International',
		displayOrder: 10,
		descriptionMd: 'Alpha is **frozen** seed data.',
		descriptionHtml: '<p>Alpha is <strong>frozen</strong> seed data.</p>'
	},
	{
		// Sorts first by id but after beta by display order, so a lost
		// `ORDER BY display_order` shows up.
		id: 'aardvark',
		name: 'Aardvark Physics Olympiad',
		summary: 'Ordered by display order, not id.',
		icon: '🐜',
		tag: 'Open',
		displayOrder: 25
	},
	{
		id: 'beta',
		name: 'Beta Physics Olympiad',
		summary: 'A small frozen olympiad.',
		icon: '🅱️',
		tag: 'Regional',
		displayOrder: 20
	},
	{
		id: 'delta',
		name: 'Delta Physics Olympiad',
		summary: 'Shares a prefix with delta-w.',
		icon: '🔺',
		tag: 'National',
		displayOrder: 30
	},
	{
		id: 'delta-w',
		name: 'Delta Physics Olympiad (Women)',
		summary: 'Its id starts with "delta".',
		icon: '🔻',
		tag: 'National',
		displayOrder: 31
	},
	{
		id: 'e2e-assigned',
		name: 'Assigned Physics Olympiad',
		summary: 'The olympiad USERS.contributor may edit.',
		icon: '📝',
		tag: 'Open',
		displayOrder: 40
	}
];

// Explicit ids, so rows can reference each other. Specs that insert rows get
// autoincrement ids above these.
const YEARS: Year[] = [
	{
		id: 1001,
		olympiadId: 'alpha',
		year: 2019,
		notes: JSON.stringify(['Held online.']),
		// The `javascript:` link predates `saveMetadata`'s check; the olympiad page
		// must skip it (olympiads/olympiad-page.spec.ts).
		extraLinks: JSON.stringify([
			{ label: 'Official site', url: 'https://example.org/alpha-2019' },
			{ label: 'Evil link', url: 'javascript:alert(1)' }
		])
	},
	{ id: 1002, olympiadId: 'alpha', year: 2020 },
	{ id: 1003, olympiadId: 'beta', year: 2021 },
	{ id: 1004, olympiadId: 'delta', year: 2020 },
	{ id: 1005, olympiadId: 'delta-w', year: 2020 },
	{ id: 1006, olympiadId: 'e2e-assigned', year: 2018 }
];

const PROBLEMS: Problem[] = [
	// No title contains a topic name, so "no topic name rendered" can't match a title.
	{
		id: 2001,
		yearId: 1001,
		number: 'T1',
		title: 'Rolling Cylinder',
		topics: JSON.stringify(['Mechanics']),
		maxScore: 10
	},
	{
		id: 2002,
		yearId: 1001,
		number: 'T2',
		title: XSS_TITLE,
		topics: JSON.stringify(['Electromagnetism']),
		maxScore: 10
	},
	{
		id: 2003,
		yearId: 1001,
		number: 'T3',
		title: 'Fast Rocket',
		topics: JSON.stringify(['Relativity', 'Modern']),
		maxScore: 7.5
	},
	{ id: 2004, yearId: 1002, number: '1', title: 'Heat Engine', topics: '["Thermodynamics"]' },
	// No title and no max score: both keys must be omitted from the API, not null.
	{ id: 2005, yearId: 1002, number: '2' },
	{ id: 2006, yearId: 1003, number: '1', title: 'Beta Spring' },
	{ id: 2007, yearId: 1004, number: '1', title: 'Delta Lens' },
	{ id: 2008, yearId: 1005, number: '1', title: 'Delta Women Circuit' },
	{ id: 2009, yearId: 1006, number: 'P1', title: 'Assigned Problem', maxScore: 20 }
];

/** Seeded file urls, following the R2 key layout (`storage.ts`'s `fileKey`). */
export const FILE_URLS = {
	alphaPaper: cdn('olympiads/alpha/2019/problems.pdf'),
	alphaSolution: cdn('olympiads/alpha/2019/T1/solution.pdf'),
	deltaWPaper: cdn('olympiads/delta-w/2020/problems.pdf')
} as const;

/** How many delta-w files carry `PHRASES.deltaWBulk`: DEEP_SEARCH_LIMIT + 1. */
export const DELTA_W_BULK = 21;

/** The urls of delta-w's bulk files, `part_1.pdf` to `part_21.pdf`. */
const deltaWBulkUrls = Array.from({ length: DELTA_W_BULK }, (_, i) =>
	cdn(`olympiads/delta-w/2020/part_${i + 1}.pdf`)
);

// search/files-olympiad-filter.spec.ts: one long beta document, defined above
// the two arrays its rows are in.

/** Pads {@link BETA_BOOKLET}'s text. Shares no word with any phrase. */
const BOOKLET_FILLER =
	'The apparatus rests on a granite bench while each student records the readings by hand.';

/**
 * owned by search/files-olympiad-filter.spec.ts: a year-level file of the frozen
 * beta 2021 (year 1003), read by that spec only.
 *
 * Its text holds `PHRASES.deltaWBulk` once and is padded far longer than
 * delta-w's bulk files. bm25 favours short documents, so it ranks below all
 * DELTA_W_BULK of them: the unfiltered top 20 leaves it out, and only a
 * beta-scoped search returns it.
 *
 * It also holds both words of `PHRASES.deltaW`, apart, so the phrase rung still
 * matches only delta-w's paper, and a beta-scoped search for it falls through to
 * the `AND` rung, which matches this file.
 */
export const BETA_BOOKLET = {
	url: cdn('olympiads/beta/2021/booklet.pdf'),
	label: 'Booklet',
	text: [
		'Booklet.',
		...Array(8).fill(BOOKLET_FILLER),
		`A ${PHRASES.deltaWBulk} is mentioned once in this booklet.`,
		...Array(8).fill(BOOKLET_FILLER),
		'The piston undergoes a quasistatic compression before it starts to wobble on its seal.',
		...Array(8).fill(BOOKLET_FILLER)
	].join(' ')
} as const;

const YEAR_FILES: YearFile[] = [
	{ id: 3001, yearId: 1001, label: 'Problems', url: FILE_URLS.alphaPaper },
	{ id: 3002, yearId: 1005, label: 'Problems', url: FILE_URLS.deltaWPaper },
	...deltaWBulkUrls.map((url, i) => ({ id: 3101 + i, yearId: 1005, label: `Part ${i + 1}`, url })),
	// search/files-olympiad-filter.spec.ts
	{ id: 5_900_001, yearId: 1003, label: BETA_BOOKLET.label, url: BETA_BOOKLET.url }
];

const PROBLEM_FILES: ProblemFile[] = [
	{ id: 4001, problemId: 2001, label: 'Solution', url: FILE_URLS.alphaSolution }
];

/** Already-normalised text, as `normalizeExtracted` would store it. */
function indexed(url: string, text: string): FileText {
	return { url, status: 'ok', text, chars: text.length, ext: 'pdf' };
}

/** A `file_text` row whose file is gone: what **Prune orphans** deletes. */
export const ORPHAN_URL = cdn('olympiads/e2e-gone/2000/deleted.pdf');

const FILE_TEXT: FileText[] = [
	indexed(
		FILE_URLS.alphaPaper,
		`Problem T1. A uniform cylinder rolls without slipping down an incline. ` +
			`Problem T2. A charged ring. Problem T3. A ${PHRASES.alphaPaper} on a fast rocket.`
	),
	indexed(
		FILE_URLS.alphaSolution,
		`Solution to T1. The ${PHRASES.alphaSolution} gives the period. ` +
			`An uploaded paper may contain markup such as ${SCRIPT_IN_TEXT} which must stay text.`
	),
	indexed(FILE_URLS.deltaWPaper, `Problem 1. A circuit whose ${PHRASES.deltaW} is measured twice.`),
	...deltaWBulkUrls.map((url, i) =>
		indexed(url, `Part ${i + 1}. A ${PHRASES.deltaWBulk} is climbed one rung at a time.`)
	),
	// global: deleted by admin/index-panel.spec.ts's Prune. Never a search result,
	// since search joins back to the file tables.
	indexed(ORPHAN_URL, 'An orphaned text row whose file was deleted long ago.'),
	// search/files-olympiad-filter.spec.ts. No explicit id, like every row above.
	indexed(BETA_BOOKLET.url, BETA_BOOKLET.text)
];

// ── Owned content ───────────────────────────────────────────────────────────
// Each olympiad below is written by exactly one spec file, named in its summary.

/** The olympiad and years each owned spec edits. */
export const OWNED = {
	/** contribute/olympiad-editor.spec.ts */
	iconOlympiad: 'e2e-icon',
	/** contribute/year-metadata.spec.ts: one year per test. */
	metaOlympiad: 'e2e-meta',
	metaYears: { rowShift: 2001, topics: 2002, duplicates: 2003, links: 2004 },
	/** contribute/year-files.spec.ts: one year per test. */
	filesOlympiad: 'e2e-files',
	filesYears: { upload: 2021, noParser: 2022, search: 2023, retry: 2024 },
	// contribute/olympiad-years-csv.spec.ts
	/** The export, the unchanged round trip, the refused imports and an added year. */
	csvOlympiad: 'e2e-csv',
	/** The import that fills gaps. Its own olympiad, so the export above never changes. */
	csvFillOlympiad: 'e2e-csv-fill',
	/**
	 * contribute/delete.spec.ts: one year per test, and a witness year it only
	 * searches, never writes.
	 */
	delOlympiad: 'e2e-del',
	delYears: { file: 2001, reupload: 2002, year: 2003, witness: 2004 }
} as const;

// ── search/problem-filters.spec.ts ──
/**
 * owned by search/problem-filters.spec.ts, read only. An olympiad whose
 * problems all match {@link RANKING}`.query`: `count` exact matches, plus one
 * `target` with a typo-like inserted letter, which uFuzzy ranks after all of
 * them, so it is past the top 50 (MAX_RESULTS). Only the target has a topic,
 * and `USERS.searcher` has done only the target, so either filter finds it if
 * it runs before ranking, and loses it if it runs on the top 50. Nothing in its
 * name or year matches the query, or every row would tie with the target.
 */
export const RANKING = {
	olympiad: 'e2e-sf-bulk',
	name: 'Bulk Ranking Contest',
	year: 2001,
	query: 'zorbex',
	/** The title of every exact match. */
	title: 'Zorbex Drill',
	count: 50,
	target: { number: 'P51', title: 'Zorbiex Drill', topic: 'Waves and Optics' }
} as const;

const OWNED_OLYMPIADS: Olympiad[] = [
	{
		id: OWNED.iconOlympiad,
		name: 'Icon Physics Olympiad',
		summary: 'Owned by contribute/olympiad-editor.spec.ts.',
		icon: '🖼️',
		tag: 'Open',
		displayOrder: 100,
		descriptionMd: 'A **draft** description.',
		descriptionHtml: '<p>A <strong>draft</strong> description.</p>'
	},
	{
		id: OWNED.metaOlympiad,
		name: 'Metadata Physics Olympiad',
		summary: 'Owned by contribute/year-metadata.spec.ts.',
		icon: '🗂️',
		tag: 'Open',
		displayOrder: 101
	},
	{
		id: OWNED.filesOlympiad,
		name: 'Files Physics Olympiad',
		summary: 'Owned by contribute/year-files.spec.ts.',
		icon: '📎',
		tag: 'Open',
		displayOrder: 102
	},
	// contribute/olympiad-years-csv.spec.ts
	{
		id: OWNED.csvOlympiad,
		name: 'CSV Physics Olympiad',
		summary: 'Owned by contribute/olympiad-years-csv.spec.ts.',
		icon: '🧾',
		tag: 'Open',
		displayOrder: 103
	},
	{
		id: OWNED.csvFillOlympiad,
		name: 'CSV Fill Physics Olympiad',
		summary: 'Owned by contribute/olympiad-years-csv.spec.ts.',
		icon: '🧮',
		tag: 'Open',
		displayOrder: 104
	},
	// contribute/delete.spec.ts
	{
		id: OWNED.delOlympiad,
		name: 'Erasure Physics Olympiad',
		summary: 'Owned by contribute/delete.spec.ts.',
		icon: '🗑️',
		tag: 'Open',
		displayOrder: 540
	},
	// olympiads/index.spec.ts: read only, by that spec alone. Two olympiads that tie
	// on display order, so only the id tiebreaker (listOlympiads) orders them.
	// Inserted, and named, in the opposite order to their ids, so neither insertion
	// order nor name order can pass for it. No frozen olympiad ties.
	{
		id: 'e2e-idx-tie-b',
		name: 'Xray Tiebreak Olympiad',
		summary: 'Owned by olympiads/index.spec.ts. Ties with e2e-idx-tie-a.',
		icon: '⚖️',
		tag: 'Open',
		displayOrder: 50
	},
	{
		id: 'e2e-idx-tie-a',
		name: 'Yankee Tiebreak Olympiad',
		summary: 'Owned by olympiads/index.spec.ts. Ties with e2e-idx-tie-b.',
		icon: '🪢',
		tag: 'Open',
		displayOrder: 50
	},
	// ── search/problem-filters.spec.ts ──
	// After every frozen olympiad, so the search index lists frozen problems first.
	{
		id: RANKING.olympiad,
		name: RANKING.name,
		summary: 'Owned by search/problem-filters.spec.ts, read only.',
		icon: '🧮',
		tag: 'Open',
		displayOrder: 5700
	}
];

const { rowShift, topics, duplicates, links } = OWNED.metaYears;
const { upload, noParser, search, retry } = OWNED.filesYears;

const OWNED_YEARS: Year[] = [
	{ id: 1101, olympiadId: OWNED.metaOlympiad, year: rowShift },
	{ id: 1102, olympiadId: OWNED.metaOlympiad, year: topics },
	{ id: 1103, olympiadId: OWNED.metaOlympiad, year: duplicates },
	{
		id: 1104,
		olympiadId: OWNED.metaOlympiad,
		year: links,
		notes: JSON.stringify(['A seeded note.']),
		extraLinks: JSON.stringify([{ label: 'Official site', url: 'https://example.org/meta-2004' }])
	},
	{ id: 1111, olympiadId: OWNED.filesOlympiad, year: upload },
	{ id: 1112, olympiadId: OWNED.filesOlympiad, year: noParser },
	{ id: 1113, olympiadId: OWNED.filesOlympiad, year: search },
	{ id: 1114, olympiadId: OWNED.filesOlympiad, year: retry },
	// contribute/olympiad-years-csv.spec.ts. 2002 has the lower id, and so does its
	// problem, so an export ordered by id rather than by year shows up.
	{ id: 5_300_001, olympiadId: OWNED.csvOlympiad, year: 2002 },
	{ id: 5_300_002, olympiadId: OWNED.csvOlympiad, year: 2001 },
	{ id: 5_300_011, olympiadId: OWNED.csvFillOlympiad, year: 2001 },
	// contribute/delete.spec.ts
	{ id: 5_400_001, olympiadId: OWNED.delOlympiad, year: OWNED.delYears.file },
	{ id: 5_400_002, olympiadId: OWNED.delOlympiad, year: OWNED.delYears.reupload },
	{ id: 5_400_003, olympiadId: OWNED.delOlympiad, year: OWNED.delYears.year },
	{ id: 5_400_004, olympiadId: OWNED.delOlympiad, year: OWNED.delYears.witness },
	// ── search/problem-filters.spec.ts ──
	{ id: 5_700_001, olympiadId: RANKING.olympiad, year: RANKING.year }
];

const OWNED_PROBLEMS: Problem[] = [
	// Row shift: three rows whose every field differs, so a shift shows up. T1's
	// maximum is blank, ahead of the filled T3, so an input rendered only while
	// its field is set would shift T3's maximum into T1 (metadata.ts).
	{
		id: 2101,
		yearId: 1101,
		number: 'T1',
		title: 'First Problem',
		topics: JSON.stringify(['Mechanics']),
		maxScore: null
	},
	{
		id: 2102,
		yearId: 1101,
		number: 'T2',
		title: 'Second Problem',
		topics: JSON.stringify(['Thermodynamics']),
		maxScore: 20
	},
	{
		id: 2103,
		yearId: 1101,
		number: 'T3',
		title: 'Third Problem',
		topics: JSON.stringify(['Relativity']),
		maxScore: 30
	},
	// Topics surviving a save.
	{
		id: 2111,
		yearId: 1102,
		number: 'T1',
		title: 'Topical Problem',
		topics: JSON.stringify(['Waves and Optics', 'Modern'])
	},
	{ id: 2112, yearId: 1102, number: 'T2', title: 'Untagged Problem' },
	// Duplicate numbers.
	{ id: 2121, yearId: 1103, number: 'T1', title: 'One' },
	{ id: 2122, yearId: 1103, number: 'T2', title: 'Two' },
	// A problem to attach a file to.
	{ id: 2131, yearId: 1111, number: 'P1', title: 'Upload Target' },
	// contribute/olympiad-years-csv.spec.ts. The export: one row for each rule of
	// the titles.csv contract (docs/data-model.md). Topics joined by `;`, a row
	// with nothing set, a title quoted for its comma and quotes, a maximum that
	// rounding would turn into 0, and an accent that needs the BOM.
	{
		id: 5_300_101,
		yearId: 5_300_001,
		number: '1',
		title: 'Électron Gun',
		topics: JSON.stringify(['Electromagnetism']),
		maxScore: 7.5
	},
	{
		id: 5_300_102,
		yearId: 5_300_002,
		number: 'T1',
		title: 'Spinning Top',
		topics: JSON.stringify(['Mechanics', 'Waves and Optics']),
		maxScore: 10
	},
	{ id: 5_300_103, yearId: 5_300_002, number: 'T2' },
	{ id: 5_300_104, yearId: 5_300_002, number: 'T3', title: 'Springs, "Coupled"', maxScore: 0.001 },
	// The import that fills gaps: T1's title is set and must survive an edited
	// CSV; T2 has nothing set, so the CSV fills it.
	{ id: 5_300_111, yearId: 5_300_011, number: 'T1', title: 'Kept Title' },
	{ id: 5_300_112, yearId: 5_300_011, number: 'T2' },
	// contribute/delete.spec.ts: a problem file in each year whose files it deletes.
	{ id: 5_400_101, yearId: 5_400_001, number: 'T1', title: 'Pruned Problem' },
	{ id: 5_400_103, yearId: 5_400_003, number: 'T1', title: 'Vanishing Problem' },
	// ── search/problem-filters.spec.ts ──
	// The target has the lowest id, so it comes first in the index: only the
	// ranking can push it past the top 50.
	{
		id: 5_700_100,
		yearId: 5_700_001,
		number: RANKING.target.number,
		title: RANKING.target.title,
		topics: JSON.stringify([RANKING.target.topic])
	},
	...Array.from({ length: RANKING.count }, (_, i) => ({
		id: 5_700_101 + i,
		yearId: 5_700_001,
		number: `P${i + 1}`,
		title: RANKING.title
	}))
];

// ── search/problem-filters.spec.ts ──
/**
 * owned by search/problem-filters.spec.ts, read only: `USERS.searcher`'s
 * progress. Spread over three frozen olympiads and two alpha years, so the
 * dialog's "Done" list shows the index order; alpha 2019 T1 is scored. The
 * target of {@link RANKING} is done too.
 */
const SEARCHER_PROGRESS: Progress[] = [
	{ id: 5_700_201, userId: USERS.searcher.id, problemId: 2001, score: 8 }, // alpha 2019 T1
	{ id: 5_700_202, userId: USERS.searcher.id, problemId: 2004, score: null }, // alpha 2020 1
	{ id: 5_700_203, userId: USERS.searcher.id, problemId: 2006, score: null }, // beta 2021 1
	{ id: 5_700_204, userId: USERS.searcher.id, problemId: 2008, score: null }, // delta-w 2020 1
	{ id: 5_700_205, userId: USERS.searcher.id, problemId: 5_700_100, score: null } // RANKING.target
];

/** Files of owned problems, so a row shift that moves a file shows up. */
export const OWNED_FILE_URLS = {
	rowShiftT1: cdn(`olympiads/${OWNED.metaOlympiad}/${rowShift}/T1/solution.pdf`),
	rowShiftT3: cdn(`olympiads/${OWNED.metaOlympiad}/${rowShift}/T3/solution.pdf`)
} as const;

/** contribute/delete.spec.ts's files in OWNED.delOlympiad, by the R2 key layout. */
const delFile = (year: number, path: string) =>
	cdn(`olympiads/${OWNED.delOlympiad}/${year}/${path}`);

/** contribute/delete.spec.ts's files, each indexed with its own phrase. */
export const DEL_FILE_URLS = {
	/** 2001's year-level Problems: deleted. */
	fileProblems: delFile(OWNED.delYears.file, 'problems.pdf'),
	/** 2001's year-level Solutions: no phrase, and kept while its sibling goes. */
	fileSolutions: delFile(OWNED.delYears.file, 'solutions.pdf'),
	/** 2001 T1's Solution: deleted. */
	fileT1: delFile(OWNED.delYears.file, 'T1/solution.pdf'),
	/** 2002's Problems: deleted, then uploaded again under the same label, so the same url. */
	reupload: delFile(OWNED.delYears.reupload, 'problems.pdf'),
	/** 2003's year-level Problems: deleted with the year. */
	yearProblems: delFile(OWNED.delYears.year, 'problems.pdf'),
	/** 2003 T1's Solution: deleted with the year. */
	yearT1: delFile(OWNED.delYears.year, 'T1/solution.pdf')
} as const;

/**
 * How many files contribute/delete.spec.ts's witness year holds:
 * DEEP_SEARCH_LIMIT, copied, since `#lib/search.js` imports through `#lib`. A scoped
 * search for a count phrase then fills the page exactly once the deleted files'
 * rows are gone, and is `truncated` while any is left.
 */
export const DEL_WITNESSES = 20;

const delWitnessUrls = Array.from({ length: DEL_WITNESSES }, (_, i) =>
	delFile(OWNED.delYears.witness, `witness_${i + 1}.pdf`)
);

const OWNED_PROBLEM_FILES: ProblemFile[] = [
	{ id: 4101, problemId: 2101, label: 'Solution', url: OWNED_FILE_URLS.rowShiftT1 },
	{ id: 4103, problemId: 2103, label: 'Solution', url: OWNED_FILE_URLS.rowShiftT3 },
	// contribute/delete.spec.ts
	{ id: 5_400_401, problemId: 5_400_101, label: 'Solution', url: DEL_FILE_URLS.fileT1 },
	{ id: 5_400_403, problemId: 5_400_103, label: 'Solution', url: DEL_FILE_URLS.yearT1 }
];

/** Year-level files of owned years. */
const OWNED_YEAR_FILES: YearFile[] = [
	// contribute/delete.spec.ts
	{ id: 5_400_201, yearId: 5_400_001, label: 'Problems', url: DEL_FILE_URLS.fileProblems },
	{ id: 5_400_202, yearId: 5_400_001, label: 'Solutions', url: DEL_FILE_URLS.fileSolutions },
	{ id: 5_400_211, yearId: 5_400_002, label: 'Problems', url: DEL_FILE_URLS.reupload },
	{ id: 5_400_221, yearId: 5_400_003, label: 'Problems', url: DEL_FILE_URLS.yearProblems },
	...delWitnessUrls.map((url, i) => ({
		id: 5_400_301 + i,
		yearId: 5_400_004,
		label: `Witness ${i + 1}`,
		url
	}))
];

/** The indexed text of owned files. */
const OWNED_FILE_TEXT: FileText[] = [
	// contribute/delete.spec.ts
	indexed(
		DEL_FILE_URLS.fileProblems,
		`Problem 1. An ${PHRASES.delFile} beside a ${PHRASES.delFileCount}.`
	),
	indexed(
		DEL_FILE_URLS.fileT1,
		`Solution to T1. The ${PHRASES.delFile} needs a ${PHRASES.delFileCount}.`
	),
	indexed(DEL_FILE_URLS.fileSolutions, 'Solutions to every problem, kept when a sibling goes.'),
	indexed(DEL_FILE_URLS.reupload, `Problem 1. An ${PHRASES.delReplaced} on a slope.`),
	indexed(
		DEL_FILE_URLS.yearProblems,
		`Problem 1. A ${PHRASES.delYear} beside an ${PHRASES.delYearCount}.`
	),
	indexed(
		DEL_FILE_URLS.yearT1,
		`Solution to T1. The ${PHRASES.delYear} needs an ${PHRASES.delYearCount}.`
	),
	...delWitnessUrls.map((url, i) =>
		indexed(url, `Witness ${i + 1}. A ${PHRASES.delFileCount} beside an ${PHRASES.delYearCount}.`)
	)
];

// ── Activity log: admin/activity-log.spec.ts ────────────────────────────────
// Owned by admin/activity-log.spec.ts, which only reads these rows. Other specs
// log rows as they run (uploads, saves, creates); those get higher ids, so they
// push this block down the Log tab but never into it.

/** One row of {@link LOG_PAGING_ENTRIES}, as the spec finds it on screen. */
export type LogPagingEntry = { id: number; detail: string; tied: boolean };

/**
 * The entries, by number, that share one exact `created_at`: a run of 30. The
 * Log tab pages by 25 (`LOG_PAGE_SIZE` in admin/+page.server.ts), and any 26
 * consecutive rows hold a page seam, so a seam falls inside the run however far
 * down other specs' rows push it. A cursor on the timestamp alone would skip or
 * repeat rows there.
 */
const LOG_TIE = { from: 16, to: 45 } as const;

/**
 * owned by admin/activity-log.spec.ts: 60 rows, more than two pages of the Log
 * tab, oldest (lowest id) first, ids 5_200_001 to 5_200_060. Each `detail` is
 * unique, so the spec finds its own rows among everyone else's.
 */
export const LOG_PAGING_ENTRIES: readonly LogPagingEntry[] = Array.from({ length: 60 }, (_, i) => ({
	id: 5_200_001 + i,
	detail: `e2e-log entry ${String(i + 1).padStart(2, '0')}`,
	tied: i + 1 >= LOG_TIE.from && i + 1 <= LOG_TIE.to
}));

/**
 * The rows, a month before `now`, so they are older than anything a spec logs.
 * Their minutes past that base rise with the id, as real rows' do, except
 * across the tied run.
 */
function logPagingRows(now: Date): ActivityLog[] {
	const base = now.getTime() - 30 * 24 * 60 * 60 * 1000;
	const tieLength = LOG_TIE.to - LOG_TIE.from;
	return LOG_PAGING_ENTRIES.map((entry, i) => {
		const n = i + 1;
		const minute = entry.tied ? LOG_TIE.from : n < LOG_TIE.from ? n : n - tieLength;
		return {
			id: entry.id,
			// No account: the log keeps the name of a user since deleted (schema.ts).
			userId: null,
			userName: 'Lena Ledger',
			action: 'save_metadata',
			detail: entry.detail,
			createdAt: new Date(base + minute * 60 * 1000)
		};
	});
}

// ── search/files-panel.spec.ts ──────────────────────────────────────────────
// Read by search/files-panel.spec.ts only, written by no spec. An olympiad of
// its own, so its documents can hold long sentences and shared words without
// changing any other spec's search results. Ids 5_800_000 to 5_809_999.

/** The ⌘K files-panel olympiad: one year, three problems, three documents. */
export const FILES_PANEL = {
	olympiadId: 'e2e-fp-cycloid',
	olympiadName: 'Cycloid Physics Olympiad',
	urls: {
		/** Year-level. Holds `sentence` word for word. */
		paper: cdn('olympiads/e2e-fp-cycloid/2015/problems.pdf'),
		/** P1's solution. Holds every word of `sentence`, in another order. */
		solution: cdn('olympiads/e2e-fp-cycloid/2015/P1/solution.pdf'),
		/** One object attached to both P2 and P3, as an imported marking scheme is. */
		marking: cdn('olympiads/e2e-fp-cycloid/2015/marking_scheme.pdf')
	},
	/** Thirteen words, adjacent in `paper` only, as copied from it. */
	sentence: 'Find the curve along which a bead slides from rest between two points.',
	/** Five words in both documents, adjacent in `solution` only. */
	adjacentInSolution: 'bead slides between two points',
	/** In `paper` and `solution`, and in no other seeded document. */
	inPaperAndSolution: 'isochronous',
	/** In `marking` only. */
	inMarking: 'escapement'
} as const;

const FILES_PANEL_ROWS = {
	olympiads: [
		{
			id: FILES_PANEL.olympiadId,
			name: FILES_PANEL.olympiadName,
			summary: 'Read by search/files-panel.spec.ts.',
			icon: '🌀',
			tag: 'Open',
			displayOrder: 9100
		}
	] satisfies Olympiad[],
	years: [{ id: 5_800_001, olympiadId: FILES_PANEL.olympiadId, year: 2015 }] satisfies Year[],
	problems: [
		{
			id: 5_800_101,
			yearId: 5_800_001,
			number: 'P1',
			title: 'Sliding Bead',
			topics: '["Mechanics"]'
		},
		{
			id: 5_800_102,
			yearId: 5_800_001,
			number: 'P2',
			title: 'Hanging Chain',
			topics: '["Mechanics"]'
		},
		{
			id: 5_800_103,
			yearId: 5_800_001,
			number: 'P3',
			title: 'Pendulum Clock',
			topics: '["Mechanics"]'
		}
	] satisfies Problem[],
	yearFiles: [
		{ id: 5_800_201, yearId: 5_800_001, label: 'Problems', url: FILES_PANEL.urls.paper }
	] satisfies YearFile[],
	problemFiles: [
		{ id: 5_800_301, problemId: 5_800_101, label: 'Solution', url: FILES_PANEL.urls.solution },
		// One url under two problems: a single search row that lists both.
		{ id: 5_800_302, problemId: 5_800_102, label: 'Marking scheme', url: FILES_PANEL.urls.marking },
		{ id: 5_800_303, problemId: 5_800_103, label: 'Marking scheme', url: FILES_PANEL.urls.marking }
	] satisfies ProblemFile[],
	// No problem number ("P1") appears in any text, so a number in a result row
	// comes from its problems list, never from the snippet.
	fileText: [
		{
			id: 5_800_401,
			...indexed(
				FILES_PANEL.urls.paper,
				'Johann Bernoulli posed the brachistochrone challenge in 1696: Find the curve ' +
					'along which a bead slides from rest between two points in the least time. ' +
					'A heavy chain hangs between two hooks and settles into a catenary. ' +
					'Huygens built an isochronous clock whose bob follows a cycloid.'
			)
		},
		{
			id: 5_800_402,
			...indexed(
				FILES_PANEL.urls.solution,
				'Solution. Picture a sliding bead: from rest, the bead slides between two points ' +
					'along the curve which we then find, and the least time comes from a cycloid. ' +
					'The bob of an isochronous pendulum traces the same curve.'
			)
		},
		{
			id: 5_800_403,
			...indexed(
				FILES_PANEL.urls.marking,
				'Marking scheme. Award marks for the catenary tension and for the escapement of the clock.'
			)
		}
	] satisfies FileText[]
};

// ── Assembly ────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

function userRow(u: SeedUser, now: Date): User {
	return {
		id: u.id,
		name: u.name,
		email: u.email,
		emailVerified: true,
		role: u.role,
		banned: u.banned ?? false,
		banReason: u.banned ? 'Banned by hand in SQL' : null,
		assignedOlympiads: JSON.stringify(u.assignedOlympiads ?? []),
		createdAt: now,
		updatedAt: now
	};
}

function sessionRow(key: UserKey, u: SeedUser, now: Date): Session | null {
	const kind = u.session ?? 'fresh';
	if (kind === 'none') return null;
	return {
		id: `e2e-session-${key}`,
		token: sessionToken(key),
		userId: u.id,
		expiresAt: new Date(now.getTime() + (kind === 'stale' ? 5 : 7) * DAY),
		createdAt: now,
		// NOT NULL with no SQL default (schema.ts). Drizzle's `$onUpdate` would fill
		// it on insert, but set it explicitly so a raw-SQL seed can't forget it.
		updatedAt: now
	};
}

/** Every table's rows, in foreign-key order. */
export function seedRows(now: Date) {
	const users = [
		...Object.values(USERS as Record<string, SeedUser>).map((u) => userRow(u, now)),
		// admin/users-table.spec.ts
		...usersTableFillerRows(now)
	];
	const sessions = (Object.entries(USERS) as [UserKey, SeedUser][])
		.map(([key, u]) => sessionRow(key, u, now))
		.filter((s): s is Session => s !== null);
	const progress: Progress[] = [
		// olympiads/progress-filters.spec.ts: USERS.progressReader's progress on the
		// frozen alpha, never written. 2019: T1 scored, T3 done with no score, T2
		// untracked. 2020: problem 1 scored with no maximum (so "unscaled"), 2
		// untracked. Every state a filter or a year total can tell apart.
		{ id: 5_600_001, userId: USERS.progressReader.id, problemId: 2001, score: 8.5 },
		{ id: 5_600_002, userId: USERS.progressReader.id, problemId: 2003, score: null },
		{ id: 5_600_003, userId: USERS.progressReader.id, problemId: 2004, score: 3 },
		// search/problem-filters.spec.ts
		...SEARCHER_PROGRESS
	];
	// admin/activity-log.spec.ts
	const log: ActivityLog[] = [...logPagingRows(now)];

	return {
		olympiads: [...OLYMPIADS, ...OWNED_OLYMPIADS, ...FILES_PANEL_ROWS.olympiads],
		years: [...YEARS, ...OWNED_YEARS, ...FILES_PANEL_ROWS.years],
		problems: [...PROBLEMS, ...OWNED_PROBLEMS, ...FILES_PANEL_ROWS.problems],
		yearFiles: [...YEAR_FILES, ...OWNED_YEAR_FILES, ...FILES_PANEL_ROWS.yearFiles],
		problemFiles: [...PROBLEM_FILES, ...OWNED_PROBLEM_FILES, ...FILES_PANEL_ROWS.problemFiles],
		fileText: [...FILE_TEXT, ...OWNED_FILE_TEXT, ...FILES_PANEL_ROWS.fileText],
		user: users,
		session: sessions,
		problemProgress: progress,
		activityLog: log
	};
}
