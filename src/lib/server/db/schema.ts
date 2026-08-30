import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const olympiads = sqliteTable('olympiads', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	summary: text('summary').notNull(),
	icon: text('icon').notNull().default(''),
	// Must stay in sync with OLYMPIAD_TAGS in $lib/types.ts. It cannot be imported
	// here: drizzle-kit bundles this file with its own resolver, which does not
	// understand the $lib alias.
	tag: text('tag', { enum: ['International', 'Regional', 'National', 'Open'] }).notNull(),
	displayOrder: integer('display_order').notNull().default(9999),
	descriptionMd: text('description_md'),
	descriptionHtml: text('description_html')
});

export const years = sqliteTable(
	'years',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		olympiadId: text('olympiad_id')
			.notNull()
			.references(() => olympiads.id, { onDelete: 'cascade' }),
		year: integer('year').notNull(),
		notes: text('notes').notNull().default('[]'),
		extraLinks: text('extra_links').notNull().default('[]')
	},
	(t) => [uniqueIndex('years_olympiad_year_idx').on(t.olympiadId, t.year)]
);

export const yearFiles = sqliteTable(
	'year_files',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		yearId: integer('year_id')
			.notNull()
			.references(() => years.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		url: text('url').notNull()
	},
	(t) => [uniqueIndex('year_files_year_label_idx').on(t.yearId, t.label)]
);

export const problems = sqliteTable(
	'problems',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		yearId: integer('year_id')
			.notNull()
			.references(() => years.id, { onDelete: 'cascade' }),
		number: text('number').notNull(),
		title: text('title'),
		// JSON-encoded array of topic names (see PROBLEM_TOPICS in $lib/types).
		// Same convention as `notes`/`extraLinks` elsewhere in this schema.
		// Never exposed next to a problem in the UI — only used for filtering.
		topics: text('topics').notNull().default('[]'),
		// The denominator a tracked score is shown against, or NULL when no
		// contributor has set one. REAL rather than INTEGER because a marking
		// scheme's maximum is not always whole (4.5), and neither are the scores
		// compared against it — see `problem_progress.score`. Nullable, so the
		// column could be added without backfilling every existing problem.
		maxScore: real('max_score')
	},
	(t) => [uniqueIndex('problems_year_number_idx').on(t.yearId, t.number)]
);

export const problemFiles = sqliteTable(
	'problem_files',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		problemId: integer('problem_id')
			.notNull()
			.references(() => problems.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		url: text('url').notNull()
	},
	(t) => [uniqueIndex('problem_files_problem_label_idx').on(t.problemId, t.label)]
);

// `user.email` and `session.token` are unique via an explicit `uniqueIndex`
// below rather than a `.unique()` on the column, and must stay that way. The two
// are equivalent in v0, which rendered either as a `CREATE UNIQUE INDEX`, but
// drizzle-kit v1 renders `.unique()` as an inline column constraint instead —
// and SQLite cannot add one to an existing table. Switching back therefore makes
// `db:generate` emit a full rebuild (create/copy/drop/rename) of `user` and
// `session` for no logical change, dropping `session_userId_idx` on the way.
// The index names match what `curvy_the_hunter` actually created.
export const user = sqliteTable(
	'user',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull(),
		emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
		image: text('image'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull(),
		role: text('role'),
		banned: integer('banned', { mode: 'boolean' }).default(false),
		banReason: text('ban_reason'),
		banExpires: integer('ban_expires', { mode: 'timestamp_ms' }),
		// JSON-encoded array of olympiad IDs this user (as a contributor) may edit.
		// Same convention as `notes`/`extraLinks` elsewhere in this schema.
		assignedOlympiads: text('assigned_olympiads').notNull().default('[]')
	},
	(table) => [uniqueIndex('user_email_unique').on(table.email)]
);

export const session = sqliteTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		token: text('token').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		impersonatedBy: text('impersonated_by')
	},
	(table) => [
		index('session_userId_idx').on(table.userId),
		uniqueIndex('session_token_unique').on(table.token)
	]
);

export const account = sqliteTable(
	'account',
	{
		id: text('id').primaryKey(),
		// better-auth 1.7 identifies an external account by (issuer, accountId)
		// rather than (providerId, accountId), so this column is required: without
		// it the OAuth callback dies with `The field "issuer" does not exist in the
		// schema for the model "account"`. For a provider that declares no issuer of
		// its own, better-auth writes the synthetic
		// `local:oauth:<encodeURIComponent(providerId)>` — GitHub is such a provider,
		// so every row here is `local:oauth:github`.
		//
		// The default is deliberate. SQLite cannot add a NOT NULL column without one
		// ("Cannot add a NOT NULL column with default value NULL"), and it doubles as
		// the backfill for the rows that predate 1.7 — all of which were GitHub.
		// better-auth always writes `issuer` explicitly on insert, so the running app
		// never relies on it. Dropping it later costs a full table rebuild.
		issuer: text('issuer').notNull().default('local:oauth:github'),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: integer('access_token_expires_at', {
			mode: 'timestamp_ms'
		}),
		refreshTokenExpiresAt: integer('refresh_token_expires_at', {
			mode: 'timestamp_ms'
		}),
		scope: text('scope'),
		password: text('password'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [
		index('account_userId_idx').on(table.userId),
		uniqueIndex('account_issuer_accountId_idx').on(table.issuer, table.accountId)
	]
);

export const verification = sqliteTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull()
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

// Records contributor/admin actions (creating olympiads, editing metadata,
// uploading/deleting files, etc.) for display on the admin "Log" tab.
export const activityLog = sqliteTable(
	'activity_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		// Snapshot of the user's name at the time of the action, so the log still
		// reads sensibly even if the user is later deleted or renamed.
		userName: text('user_name').notNull(),
		action: text('action', {
			enum: [
				'create_olympiad',
				'update_olympiad',
				'upload_icon',
				'remove_icon',
				'add_year',
				'delete_year',
				'save_metadata',
				'upload_file',
				'delete_file',
				'import_titles'
			]
		}).notNull(),
		olympiadId: text('olympiad_id'),
		year: integer('year'),
		detail: text('detail').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	},
	(t) => [index('activity_log_created_at_idx').on(t.createdAt)]
);

/**
 * One signed-in user's progress on one problem.
 *
 * The row's existence *is* completion; `score` is null for "completed, but no
 * score recorded". There is no third state and no `completed` column — a user
 * who un-marks a problem has their row deleted.
 *
 * Both foreign keys cascade, matching `session`/`account`: progress is the
 * user's own data and dies with the account, unlike `activity_log`, which is an
 * audit trail and must outlive it. The cascade from `problems` is also why
 * renaming a problem number in the year editor throws away every user's progress
 * on it — that save is a delete plus an insert. See docs/data-model.md.
 */
export const problemProgress = sqliteTable(
	'problem_progress',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		problemId: integer('problem_id')
			.notNull()
			.references(() => problems.id, { onDelete: 'cascade' }),
		// Stored exactly as entered — validated finite and non-negative, never
		// rounded. Rounding on the way in would make three marks of 8.333 sum to
		// 24.99 where the honest total is 25. `formatScore` rounds for the cards
		// and the year totals; anything that seeds an input uses `exactScore`.
		score: real('score'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		// `onConflictDoUpdate` builds its SET with the same helper as `db.update`,
		// so this `$onUpdate` already fires on the conflict branch. The upsert in
		// `queries/progress.ts` names `updatedAt` anyway — an explicit value wins
		// over the fn, and it keeps the refresh visible where the write is.
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	// A surrogate `id` plus a unique index, never a composite primary key — the
	// pattern every other child table here uses. Two indexes, one per foreign
	// key: the composite's leading `user_id` serves both the "all of one user's
	// rows" read `getOlympiadProgress` issues and the cascade from `user`, but the
	// cascade from `problems` seeks on `problem_id` alone, which a
	// (user_id, problem_id) B-tree cannot answer — SQLite falls back to scanning
	// the whole index, once per deleted problem. Every `saveMetadata` that renames
	// a problem number deletes a problem, and deleting a year deletes all of them.
	(t) => [
		uniqueIndex('problem_progress_user_problem_idx').on(t.userId, t.problemId),
		index('problem_progress_problem_idx').on(t.problemId)
	]
);
