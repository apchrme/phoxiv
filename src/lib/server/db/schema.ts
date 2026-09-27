import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const olympiads = sqliteTable('olympiads', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	summary: text('summary').notNull(),
	icon: text('icon').notNull().default(''),
	// Keep in sync with OLYMPIAD_TAGS in $lib/types.ts. It can't be imported:
	// drizzle-kit bundles this file and doesn't resolve $lib.
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
	(t) => [
		uniqueIndex('year_files_year_label_idx').on(t.yearId, t.label),
		// Deep search and the backfill join on `url`. Not unique: two labels in one
		// parent may name the same object (which `collidingLabel` catches).
		index('year_files_url_idx').on(t.url)
	]
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
		// JSON array of topic names (PROBLEM_TOPICS in $lib/types). Used only for
		// filtering, never shown next to a problem.
		topics: text('topics').notNull().default('[]'),
		// Max score a tracked score is shown against, or NULL if unset. REAL because
		// marking schemes can have fractional maxima (4.5).
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
	(t) => [
		uniqueIndex('problem_files_problem_label_idx').on(t.problemId, t.label),
		// Same as `year_files_url_idx`.
		index('problem_files_url_idx').on(t.url)
	]
);

// Don't replace the `uniqueIndex` on `user.email` / `session.token` with
// `.unique()`: drizzle-kit v1 renders that as an inline constraint, which makes
// `db:generate` emit a full rebuild of both tables. Index names match the
// existing migration.
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
		// JSON array of olympiad IDs this user may edit as a contributor.
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
		// Required by better-auth 1.7+, which keys accounts on (issuer, accountId);
		// without it the OAuth callback fails. GitHub has no issuer, so better-auth
		// writes `local:oauth:github`. The default lets SQLite add the NOT NULL
		// column and backfills older rows (all GitHub); better-auth always sets it.
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

// Contributor/admin actions, shown on the admin "Log" tab.
export const activityLog = sqliteTable(
	'activity_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		// Name at the time of the action, so the log survives deletes and renames.
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
				'import_titles',
				// One row per `index:backfill` batch, not per file, so the log isn't flooded.
				'index_files'
			]
		}).notNull(),
		olympiadId: text('olympiad_id'),
		year: integer('year'),
		detail: text('detail').notNull().default(''),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull()
	}
	// No index on `created_at`: the admin panel pages by `id` (the rowid), and
	// nothing filters on the date. An index would only add a write per action.
);

/**
 * One user's progress on one problem. A row means completed; `score` is null
 * if no score was recorded. Un-marking deletes the row.
 *
 * Both foreign keys cascade. Renaming a problem number in the year editor is a
 * delete plus insert, so it discards everyone's progress on that problem.
 * See docs/data-model.md.
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
		// Stored as entered, never rounded, so totals stay exact. `formatScore`
		// rounds for display; inputs are seeded with `exactScore`.
		score: real('score'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	// The second index serves the cascade from `problems`, which looks up by
	// `problem_id` alone and would otherwise scan the whole table per deleted problem.
	(t) => [
		uniqueIndex('problem_progress_user_problem_idx').on(t.userId, t.problemId),
		index('problem_progress_problem_idx').on(t.problemId)
	]
);

/**
 * Extracted plain text for one uploaded file, plus its extraction state.
 *
 * Keyed by the full CDN url, the same string the file tables hold, so search
 * joins straight back to them. A row whose url is no longer referenced is
 * simply not found. Not keyed by row id, because renaming a problem recreates
 * its `problem_files` rows. No foreign key, because `url` is not unique in the
 * file tables. Kept out of the file tables so bulk reads don't carry the text.
 * See docs/search.md.
 */
export const fileText = sqliteTable(
	'file_text',
	{
		// A rowid alias, which lets the FTS5 index use `content_rowid='id'`.
		id: integer('id').primaryKey({ autoIncrement: true }),
		url: text('url').notNull(),
		status: text('status', { enum: ['pending', 'ok', 'empty', 'skipped', 'error'] })
			.notNull()
			.default('pending'),
		/**
		 * Normalised plain text, capped at `TEXT_CHAR_CAP`. NULL unless `ok`.
		 *
		 * Never select this column in an endpoint. Only FTS5 `snippet()` reads it,
		 * so only short excerpts leave the server (third-party papers are copyrighted).
		 */
		text: text('text'),
		chars: integer('chars').notNull().default(0),
		truncated: integer('truncated', { mode: 'boolean' }).notNull().default(false),
		/**
		 * ETag and size for change detection. Only the backfill script sets these;
		 * browser uploads leave them null. The Worker never reads R2.
		 */
		etag: text('etag'),
		bytes: integer('bytes'),
		/** Lowercase extension, no dot. Decides whether extraction is attempted. */
		ext: text('ext').notNull().default(''),
		/** Bumping `EXTRACTOR_VERSION` re-queues every row with no migration. */
		extractorVersion: integer('extractor_version').notNull().default(0),
		engine: text('engine').notNull().default(''),
		error: text('error'),
		/** Bounded, so one poison file cannot block the backfill queue forever. */
		attempts: integer('attempts').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
			.$onUpdate(() => new Date())
			.notNull()
	},
	(t) => [uniqueIndex('file_text_url_idx').on(t.url), index('file_text_status_idx').on(t.status)]
);
