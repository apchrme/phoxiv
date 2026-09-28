# Data model

Metadata lives in Cloudflare D1 (SQLite). Files live in R2. The schema is
[`src/lib/server/db/schema.ts`](../src/lib/server/db/schema.ts), and drizzle-kit
generates every migration from it.

## Content tables

```
olympiads ──< years ──< year_files
                  └──< problems ──< problem_files
                             └──< problem_progress >── user
```

Every arrow is `ON DELETE CASCADE`: deleting a row removes everything below it,
including every user's progress on the problems. The cascade only reaches D1, so
each action deletes its R2 objects itself. Collect the urls before the rows go,
since the rows are the only record of the keys:

- `deleteYear` removes every object of the year and its problems;
- `deleteFile` removes the one object;
- `saveMetadata` removes the objects of problems it drops or renumbers, after
  its batch commits;
- `removeIcon` is the only action that leaves an object behind (the next icon
  upload replaces it).

There is no action that deletes an olympiad; that is done by hand, R2 included.

### `olympiads`

| Column             | Type    | Notes                                                                |
| ------------------ | ------- | -------------------------------------------------------------------- |
| `id`               | TEXT PK | The acronym (`ipho`, `apho`). Appears in URLs and R2 keys; see below |
| `name`             | TEXT    | not null                                                             |
| `summary`          | TEXT    | not null; one line, shown on the listing                             |
| `icon`             | TEXT    | not null, default `''`. An emoji/flag, or a full CDN URL             |
| `tag`              | TEXT    | not null; `International` \| `Regional` \| `National` \| `Open`      |
| `display_order`    | INTEGER | not null, default `9999`. Lower sorts first; `id` breaks ties        |
| `description_md`   | TEXT    | nullable. The contributor's draft; never served publicly             |
| `description_html` | TEXT    | nullable. Rendered and sanitised at write time                       |

`createOlympiad` turns whitespace in the typed id into hyphens, then refuses
anything `isOlympiadId` rejects: 1-32 lowercase letters, digits and hyphens, not
starting with a hyphen. The id is a URL segment and an R2 key prefix, so `/`,
`?`, `#` or `.` would break both. The same rule is what deep search's olympiad
filter accepts.

`description_html` is the only HTML the app renders with `{@html}`, and only
[`$lib/server/markdown.ts`](../src/lib/server/markdown.ts) produces it. Don't add
a second renderer: two sanitiser allow-lists drift apart, and the gap is an XSS
hole.

`isIconUrl()` in [`$lib/uploads.ts`](../src/lib/uploads.ts) tells the two kinds
of `icon` apart by its `http://` or `https://` prefix.

### `years`

| Column        | Type       | Notes                                                             |
| ------------- | ---------- | ----------------------------------------------------------------- |
| `id`          | INTEGER PK | autoincrement; never appears in a URL                             |
| `olympiad_id` | TEXT       | → `olympiads.id`, cascade                                         |
| `year`        | INTEGER    | not null                                                          |
| `notes`       | TEXT       | not null, default `'[]'`; JSON `string[]`                         |
| `extra_links` | TEXT       | not null, default `'[]'`; JSON `{label,url}[]`, http(s) urls only |

Unique on `(olympiad_id, year)`, which is how the app addresses a year.

Nothing makes notes or link labels unique, so the olympiad page keys those lists
by index. Link urls become `href`s on a public page, so `saveMetadata` refuses
anything but `http:` and `https:` (a `javascript:` url would run for whoever
clicks it), and the page skips any stored before that check existed.

### `year_files` and `problem_files`

Both are `(id, <parent>_id, label, url)`. `label` is what the badge shows
("Solutions") and is unique per parent, so `uploadFile` rejects a duplicate label
rather than overwriting. (If the existing file had a different extension, an
overwrite would orphan the old object in R2.) `url` is the full CDN URL, not a key (see
[R2 key layout](#r2-key-layout)), with a non-unique index for deep search and the
backfill.

### `problems`

| Column      | Type       | Notes                                                      |
| ----------- | ---------- | ---------------------------------------------------------- |
| `id`        | INTEGER PK | autoincrement                                              |
| `year_id`   | INTEGER    | → `years.id`, cascade                                      |
| `number`    | TEXT       | not null; `T1`, `2`, `A3`. Free-form, so TEXT              |
| `title`     | TEXT       | nullable                                                   |
| `topics`    | TEXT       | not null, default `'[]'`; JSON `ProblemTopic[]`            |
| `max_score` | REAL       | nullable; the denominator a tracked score is shown against |

Unique on `(year_id, number)`.

**The problem number is the identity.** `saveMetadata` upserts on
`(year_id, number)` and deletes any problem whose number was not submitted. So
renaming a number deletes the problem, and cascades away its files and every
user's progress on it. The editor warns about this. The fix is an in-place
`UPDATE` (`EditableProblem` already carries the row `id`), but it needs its own
change.

**A save is all or nothing.** The year's notes and links, every problem upsert
and the delete go in one `db.batch()`, which D1 runs as a transaction. Every
refusal happens before it, and the R2 and `file_text` cleanup after it. A failed
cleanup leaves unreferenced objects, never rows pointing at deleted files.

**Topics are never rendered next to a problem**, because that would spoil it.
They do travel on `/api/olympiads/[olympiad]` and `/api/search`, because both
topic filters run in the browser. They must never enter the search haystack
(`searchText`), or typing "Relativity" would reveal which problems are about
relativity. `getSearchIndex` sends `topics: []` for an untagged problem, so
`topics === undefined` on the client can only mean a body cached before topics
existed. See [search.md](./search.md).

`max_score` is REAL because a maximum is not always whole. It is set in the year
editor or through [`titles.csv`](#the-titlescsv-contract). It travels in the
shared-cached `/api/olympiads/[olympiad]` body, so an edit takes up to a day to
show publicly; [purge the cache](./deployment.md#purging-the-cache-after-an-api-change)
to speed it up. `?/trackProblem` does not return the maximum. Keep it that way:
a second route for the value is a second copy that can disagree.

### `problem_progress`

One signed-in user's record of one problem.

| Column       | Type       | Notes                                               |
| ------------ | ---------- | --------------------------------------------------- |
| `id`         | INTEGER PK | autoincrement                                       |
| `user_id`    | TEXT       | → `user.id`, cascade                                |
| `problem_id` | INTEGER    | → `problems.id`, cascade                            |
| `score`      | REAL       | nullable; null means "completed, no score recorded" |
| `created_at` | INTEGER    | not null, `timestamp_ms`                            |
| `updated_at` | INTEGER    | not null, `timestamp_ms`                            |

Unique on `(user_id, problem_id)`, with a separate index on `problem_id` so the
cascade from `problems` does not scan.

- **A row existing means the problem is done.** There is no `completed` column.
  Un-marking deletes the row.
- Both foreign keys cascade: progress is the user's own data and dies with the
  account. (`activity_log` outlives it.)
- **Scores are stored exactly as entered**, validated finite and non-negative,
  never rounded. `formatScore` in [`$lib/progress.ts`](../src/lib/progress.ts)
  rounds to two decimals for display only. Anything read back (a form input, a
  `titles.csv` cell) must use `exactScore`, or the next save rounds the stored
  value.

Progress is never served from `/api/*`, which is a shared cache. See
[architecture.md](./architecture.md#why-some-pages-fetch-their-own-data).

- `GET /olympiads/[olympiad]/progress` returns a `ProgressMap` with one key per
  tracked problem. A missing key means untracked.
- `GET /progress` returns a `GlobalProgressMap`, one `ProgressMap` per olympiad,
  for the ⌘K dialog. Don't flatten it: `progressKey` is only `(year, number)`, so
  IPhO 2019 T1 and APhO 2019 T1 would collide.

### `file_text`

The extracted plain text of one uploaded document, and the state of its
extraction.

| Column               | Type       | Notes                                                              |
| -------------------- | ---------- | ------------------------------------------------------------------ |
| `id`                 | INTEGER PK | autoincrement. A rowid alias, which the FTS5 index needs           |
| `url`                | TEXT       | not null, unique. The whole CDN URL, identical to the file tables' |
| `status`             | TEXT       | one of the five below; default `pending`                           |
| `text`               | TEXT       | nullable. Normalised, capped at 512 000 chars. NULL unless `ok`    |
| `chars`, `truncated` | —          | how much was stored, and whether it was cut short                  |
| `etag`, `bytes`      | —          | nullable; only the backfill script fills these                     |
| `ext`                | TEXT       | lowercase, no dot. Decides whether extraction is attempted         |
| `extractor_version`  | INTEGER    | bump `EXTRACTOR_VERSION` to re-queue every row, with no migration  |
| `engine`             | TEXT       | `browser-pdfjs` or `cli-unpdf`                                     |
| `error`, `attempts`  | —          | why it failed, and how many tries it has had                       |

| status    | meaning                                                                    |
| --------- | -------------------------------------------------------------------------- |
| `pending` | queued. `uploadFile` writes it inline, so every upload has a row           |
| `ok`      | text extracted and stored                                                  |
| `empty`   | conversion worked but found no text: a scanned PDF. Shown, not an error    |
| `skipped` | extension not extractable (`zip`, `doc`, and `docx`/`xlsx` in the browser) |
| `error`   | converter failed. `error` says why; `attempts` limits retries              |

Rules:

- **Keyed by URL**, not by file row id (renaming a problem number re-inserts its
  file rows) and not by content hash (that means reading 50 MB to decide to
  skip).
- **Correctness never depends on cleanup.** `searchFiles` inner-joins
  `file_text.url` to the URLs in `year_files` and `problem_files`, so a row whose
  file is gone can never produce a result. The cleanups in `deleteFile`,
  `deleteYear` and `saveMetadata` are best-effort.
- **No foreign key**, because `url` is not unique in either file table. A
  re-upload with the same label and extension gets the same URL, and the upsert
  resets the row.
- **A separate table**, because the file tables are fanned out over LEFT JOINs by
  `getOlympiadYearEntries` and `getSearchIndex`. A text column there would add
  tens of kilobytes to every row.
- **No endpoint may select `file_text.text`.** Only `snippet()` reads it, inside
  the FTS5 query, and the server returns a short excerpt. This keeps third-party
  papers from being bulk-downloadable. Never write a query function that returns
  the column.

### The full-text index

`file_text_fts` is an FTS5 virtual table, created by
`20260901125216_file_text_fts/migration.sql`. **This is the only hand-written
migration in the repository**, and the one exception to CLAUDE.md rule 1.

```sql
CREATE VIRTUAL TABLE file_text_fts USING fts5(
  text, content='file_text', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2', prefix='2 3'
);
```

The migration also fills the index and creates three triggers on `file_text`
(`file_text_fts_ai`, `_ad`, `_au`).

- **External content.** A contentless table cannot return text, so `snippet()`
  would not work. A plain table stores every text twice. External content stores
  only the index, so a tokenizer change is `DROP`, `CREATE`, `'rebuild'`, with no
  re-extraction.
- **Triggers keep the index in step**, not app code, because bulk fixes through
  [`wrangler d1 execute`](./deployment.md#ad-hoc-sql) are supported.
- **`coalesce(…, '')` always, never a `WHEN` guard.** The value deleted from an
  external-content index must match the value inserted, or it silently corrupts.
- **`prefix='2 3'`** makes `gravit*` an index seek, for 30–50 % more index size.
- **`remove_diacritics 2`** folds accents, for translated papers.

#### Why `db:generate` cannot see it, and why `db:push` must never run

The folder was created with `drizzle-kit generate --custom`, which copies the
previous `snapshot.json`. So the FTS objects are in no snapshot and not in
`schema.ts`. `bun run db:generate` compares only those two and never reads the
database, so it can never emit a `DROP` for them. It should report no changes
after this migration; if it does not, stop.

`bun run db:push` inspects the live database, finds a table and three triggers no
snapshot knows about, and offers to drop them. **Never point `db:push` at
anything real.**

#### Recovery

The index is disposable. Re-run the migration's statements, then:

```sql
INSERT INTO file_text_fts(file_text_fts) VALUES('rebuild');
```

This rebuilds it from `file_text` with no re-extraction. The admin panel's
**Rebuild index** button does both steps safely (`CREATE … IF NOT EXISTS`, then
`'rebuild'`).

## Auth tables

`user`, `session`, `account` and `verification` belong to BetterAuth and are
generated by `bun run db:generate-auth`. `user` has the `admin` plugin's `role`,
`banned`, `ban_reason` and `ban_expires`, plus two notable columns:

- `user.assigned_olympiads`: TEXT, not null, default `'[]'`. JSON array of the
  olympiad ids a contributor may edit. Declared with `input: false`, so
  BetterAuth's update-user endpoint cannot set it; only the admin panel writes it.
- `account.issuer`: TEXT, not null, default `'local:oauth:github'`. BetterAuth
  1.7 identifies an account by `(issuer, account_id)`, and writes
  `local:oauth:github` for GitHub. The default let SQLite add the column to a
  populated table. Removing it forces a table rebuild.

`user.email` and `session.token` are unique through an explicit `uniqueIndex`,
not `.unique()`. drizzle-kit v1 renders `.unique()` as an inline constraint,
which SQLite cannot add to an existing table, so `db:generate` would rebuild both
tables.

See [auth.md](./auth.md).

## `activity_log`

The admin panel's audit trail, written by `logActivity()`.

| Column        | Notes                                                               |
| ------------- | ------------------------------------------------------------------- |
| `user_id`     | → `user.id`, `ON DELETE SET NULL`. The log outlives the account     |
| `user_name`   | not null. A snapshot of the name, so the log survives renames       |
| `action`      | one of eleven enum values; `LogAction` is derived from this column  |
| `olympiad_id` | plain TEXT, not a foreign key, so an olympiad's history survives it |
| `year`        | nullable                                                            |
| `detail`      | not null, default `''`; a human-readable sentence                   |

`listActivity` pages by keyset, `WHERE id < ? ORDER BY id DESC LIMIT n + 1`,
which reads exactly one page. Don't use `OFFSET`, which reads every skipped row.

The table has no index. Don't add one on `created_at` unless a reader needs it:
it costs an extra row write on every logged action. Rows sort by `id` but show
`created_at`, so two from the same millisecond may appear in either order.

## JSON-encoded TEXT columns

SQLite has no array type, so four columns hold JSON strings:

| Column                    | Contents         | Parser                                 |
| ------------------------- | ---------------- | -------------------------------------- |
| `years.notes`             | `string[]`       | `parseStringArray`                     |
| `years.extra_links`       | `{label,url}[]`  | `parseLabelledUrls`                    |
| `problems.topics`         | `ProblemTopic[]` | `parseTopics` (`$lib/utils/topics.ts`) |
| `user.assigned_olympiads` | `string[]`       | `parseStringArray`                     |

The parsers in [`$lib/utils/json.ts`](../src/lib/utils/json.ts) drop values of
the wrong type and return an empty result instead of throwing, so one malformed
row (old data, a hand edit) cannot 500 a page. `parseTopics` also drops unknown
topic names, so renaming a topic degrades gracefully.

### `OLYMPIAD_TAGS` is intentionally duplicated

The four tags appear in `$lib/types.ts` and again in `schema.ts`'s `enum:`.
drizzle-kit bundles the schema with a resolver that does not understand `$lib`,
so `schema.ts` cannot import them. Keep the two copies in sync.

## R2 key layout

Defined in one file, [`$lib/server/storage.ts`](../src/lib/server/storage.ts):

```
icons/olympiads/<olympiadId>.<ext>                            ← olympiad icons
olympiads/<olympiadId>/<year>/<slug>.<ext>                    ← year-level files
olympiads/<olympiadId>/<year>/<problemNumber>/<slug>.<ext>    ← problem files
```

`<slug>` is `slugifyLabel(label)`: lowercase, whitespace to `_`, everything
outside `[a-z0-9_]` dropped. It lives in [`$lib/uploads.ts`](../src/lib/uploads.ts)
so the browser can use it, and `storage.ts` re-exports it.

**The database stores whole URLs, not keys.** Each `url` column holds
`https://cdn.phoxiv.org/<key>`, and deletion recovers the key by stripping the
`CDN_BASE_URL` prefix:

```
url column  ──keyFromCdnUrl()──→  key  ──bucket.delete()──→  gone
```

So these fail silently:

1. **Never change `CDN_BASE_URL`** ([`$lib/constants.ts`](../src/lib/constants.ts)).
   Every object is orphaned, and deletion breaks for every row: `keyFromCdnUrl`
   returns `null` and `deleteByUrl` does nothing.
2. **Never change the key layout or `slugifyLabel`.** Same effect for later
   uploads.
3. **Only pass `deleteByUrl` a URL read from the database.** A client-supplied
   URL could delete any object.
4. **Deep search's olympiad filter reads the layout in reverse.**
   `olympiadUrlRange` sits next to `fileKey` so both change together. See
   [search.md](./search.md#the-olympiad-filter-a-url-range-not-a-join).

Also:

- **Two labels can share a slug.** `Solutions (official)` and `Solutions official`
  are distinct labels but one key, and `bucket.put` overwrites silently.
  `collidingLabel` in `$lib/uploads.ts` catches this: `uploadFile` refuses the
  upload and the editor warns first. A label that slugs to nothing is refused.
- **`<problemNumber>` is not slugified**, because existing keys use the raw
  number. `saveMetadata` refuses a number containing `/`, and `importTitles`
  skips such a row as invalid.
- **Icons are keyed by extension**, so `deleteStaleIcons` removes the other
  extensions before an upload.

### What may be uploaded

Declared once in [`$lib/uploads.ts`](../src/lib/uploads.ts), which is
client-safe, so the form's `accept` and the server's check cannot drift:

| Spec              | Extensions                           | Max   |
| ----------------- | ------------------------------------ | ----- |
| `ICON_UPLOAD`     | svg, png, jpg, jpeg, webp, avif      | 2 MB  |
| `DOCUMENT_UPLOAD` | pdf, xlsx, zip, doc, docx, htm, html | 50 MB |
| `CSV_UPLOAD`      | csv                                  | 1 MB  |

`accept` is only a hint. [`$lib/server/uploads.ts`](../src/lib/server/uploads.ts)
enforces the rules. **The extension decides the stored `Content-Type`, never
`file.type`**: the uploader controls the MIME type, and R2 would serve an HTML
payload from our own CDN origin.

## The `titles.csv` contract

`GET /contribute/<olympiad>/titles.csv` exports every problem's title, topics
and maximum score, and the `importTitles` action reads the same format. Change
both together.

```
year,number,title,topics,max_score
2019,T1,Physics of a Slinky,Mechanics;Waves and Optics,10
2019,T2,,,
```

- The header must have `year`, `number` and `title`. `topics` and `max_score` are
  optional. Headers are trimmed and lowercased on import.
- Topics are `;`-separated, since `,` is the delimiter. Unknown names are dropped.
- `max_score` must stay snake_case: a `maxScore` header would be lowercased to
  `maxscore` and ignored. A cell that is not a number above zero is skipped and
  counted in the summary toast.
- The export writes a UTF-8 BOM and CRLF line endings, or Excel garbles accents.
- Fields are quoted only when they contain `"`, `,`, CR or LF.

The import only fills gaps. It creates missing years and never overwrites an
existing value, so re-importing is safe.

## Migration workflow

```sh
# 1. edit src/lib/server/db/schema.ts
bun run db:generate        # writes migrations/<timestamp>_<name>/
bun run db:migrate         # apply to the local D1
bun run db:migrate-remote  # apply to the production D1
```

If the change touches an auth table, run `bun run db:generate-auth` first.

Each migration is a folder holding `migration.sql` and the `snapshot.json` it was
diffed against. Wrangler needs `migrations_pattern` to find them; see
[deployment.md](./deployment.md#migrations-against-production).

**Never hand-edit anything under `src/lib/server/db/migrations/`.** The SQL and
snapshot are generated together, and editing one makes the next generated
migration wrong. The one exception is [the full-text index](#the-full-text-index),
where drizzle-kit wrote the folder and snapshot and only the SQL was hand-written.

`bun run db:push` skips the migration files and offers to drop the search index.
It is for throwaway local experiments only.
