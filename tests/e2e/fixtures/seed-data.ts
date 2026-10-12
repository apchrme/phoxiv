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
 * - global: written by the serial index spec only (the FTS index).
 *
 * No spec asserts a global total, so a new row here never breaks another spec.
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

/** Phrases that appear in exactly one seeded document each. */
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
	 * `truncated`.
	 */
	deltaWBulk: 'gyroscopic precession ladder',
	/**
	 * In `fixtures/files/text.pdf` and nowhere in the seed, so a hit proves an
	 * upload's text reached the index.
	 */
	textPdf: 'marmalade tachyon interferometer'
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

const YEAR_FILES: YearFile[] = [
	{ id: 3001, yearId: 1001, label: 'Problems', url: FILE_URLS.alphaPaper },
	{ id: 3002, yearId: 1005, label: 'Problems', url: FILE_URLS.deltaWPaper },
	...deltaWBulkUrls.map((url, i) => ({ id: 3101 + i, yearId: 1005, label: `Part ${i + 1}`, url }))
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
	indexed(ORPHAN_URL, 'An orphaned text row whose file was deleted long ago.')
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
	filesYears: { upload: 2021, noParser: 2022, search: 2023, retry: 2024 }
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
	{ id: 1114, olympiadId: OWNED.filesOlympiad, year: retry }
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
	{ id: 2131, yearId: 1111, number: 'P1', title: 'Upload Target' }
];

/** Files of owned problems, so a row shift that moves a file shows up. */
export const OWNED_FILE_URLS = {
	rowShiftT1: cdn(`olympiads/${OWNED.metaOlympiad}/${rowShift}/T1/solution.pdf`),
	rowShiftT3: cdn(`olympiads/${OWNED.metaOlympiad}/${rowShift}/T3/solution.pdf`)
} as const;

const OWNED_PROBLEM_FILES: ProblemFile[] = [
	{ id: 4101, problemId: 2101, label: 'Solution', url: OWNED_FILE_URLS.rowShiftT1 },
	{ id: 4103, problemId: 2103, label: 'Solution', url: OWNED_FILE_URLS.rowShiftT3 }
];

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
	const users = Object.values(USERS as Record<string, SeedUser>).map((u) => userRow(u, now));
	const sessions = (Object.entries(USERS) as [UserKey, SeedUser][])
		.map(([key, u]) => sessionRow(key, u, now))
		.filter((s): s is Session => s !== null);
	const progress: Progress[] = [];
	const log: ActivityLog[] = [];

	return {
		olympiads: [...OLYMPIADS, ...OWNED_OLYMPIADS],
		years: [...YEARS, ...OWNED_YEARS],
		problems: [...PROBLEMS, ...OWNED_PROBLEMS],
		yearFiles: YEAR_FILES,
		problemFiles: [...PROBLEM_FILES, ...OWNED_PROBLEM_FILES],
		fileText: FILE_TEXT,
		user: users,
		session: sessions,
		problemProgress: progress,
		activityLog: log
	};
}
