# Data model

Metadata lives in Cloudflare **D1** (SQLite), the files themselves in **R2**.
The schema is [`src/lib/server/db/schema.ts`](../src/lib/server/db/schema.ts) —
the single source drizzle-kit generates migrations from.

## Content tables

```
olympiads ──< years ──< year_files
                  └──< problems ──< problem_files
                             └──< problem_progress >── user
```

Every arrow is `ON DELETE CASCADE`, so deleting an olympiad removes its years,
their files, their problems, those problems' files **and every user's tracked
progress on them**. **The cascade only reaches D1** — the R2 objects behind those
rows are not touched. Cleaning up storage is each action's own job, and only
`deleteYear` currently does it in full.

### `olympiads`

| Column             | Type    | Notes                                                                 |
| ------------------ | ------- | --------------------------------------------------------------------- |
| `id`               | TEXT PK | The acronym (`ipho`, `apho`). Appears in URLs _and_ in R2 keys        |
| `name`             | TEXT    | not null                                                              |
| `summary`          | TEXT    | not null; one line, shown on the listing                              |
| `icon`             | TEXT    | not null, default `''`. Either an emoji/flag or a full CDN URL        |
| `tag`              | TEXT    | not null; `International` \| `Regional` \| `National` \| `Open`       |
| `display_order`    | INTEGER | not null, default `9999`. Lower sorts earlier; `id` is the tiebreaker |
| `description_md`   | TEXT    | nullable — the contributor's draft, never served publicly             |
| `description_html` | TEXT    | nullable — rendered and sanitised at write time                       |

`description_html` is the only HTML the app ever interpolates with `{@html}`.
[`$lib/server/markdown.ts`](../src/lib/server/markdown.ts) is the sole place it
is produced, so the sanitiser allow-list exists exactly once. A second copy would
eventually diverge, and a divergence there is an XSS hole.

`icon` distinguishes the two cases by prefix: `isIconUrl()` in
[`$lib/uploads.ts`](../src/lib/uploads.ts) simply tests for `http://` / `https://`.

### `years`

| Column        | Type       | Notes                                           |
| ------------- | ---------- | ----------------------------------------------- |
| `id`          | INTEGER PK | autoincrement; **never appears in a URL**       |
| `olympiad_id` | TEXT       | → `olympiads.id`, cascade                       |
| `year`        | INTEGER    | not null                                        |
| `notes`       | TEXT       | not null, default `'[]'` — JSON `string[]`      |
| `extra_links` | TEXT       | not null, default `'[]'` — JSON `{label,url}[]` |

Unique on `(olympiad_id, year)`. Years are addressed by that pair everywhere in
the app; the surrogate `id` is an implementation detail.

### `year_files` and `problem_files`

Both are `(id, <parent>_id, label, url)` with a unique index on
`(<parent>_id, label)`. `label` is what the badge shows ("Problems",
"Solutions"); `url` is the **full CDN URL**, not a key — see
[R2 key layout](#r2-key-layout) below.

The uniqueness matters twice over: it is why `uploadFile` rejects a duplicate
label rather than overwriting (the existing object may have a different
extension, which would orphan it while leaving the row pointing at nothing), and
it is why the editor flags a colliding label before you upload.

### `problems`

| Column      | Type       | Notes                                                       |
| ----------- | ---------- | ----------------------------------------------------------- |
| `id`        | INTEGER PK | autoincrement                                               |
| `year_id`   | INTEGER    | → `years.id`, cascade                                       |
| `number`    | TEXT       | not null; `T1`, `2`, `A3` — free-form, so TEXT              |
| `title`     | TEXT       | nullable                                                    |
| `topics`    | TEXT       | not null, default `'[]'` — JSON `ProblemTopic[]`            |
| `max_score` | REAL       | nullable — the denominator a tracked score is shown against |

Unique on `(year_id, number)`. **The problem number is the identity** as far as
the year editor is concerned: `saveMetadata` upserts on that pair and deletes any
problem whose number is no longer submitted. Renaming a number is therefore a
delete plus an insert, which cascades the old problem's `problem_files` rows away
— **and, since problem tracking landed, every user's `problem_progress` row for
it as well**. The editor says so, in as many words, above the problems list.

That is a deliberate consequence rather than an accepted defect: making a rename
an in-place `UPDATE` is the real fix (`EditableProblem` already carries the row
`id`, so the editor could submit it), but it is a behaviour change to the most
destructive action in the app and belongs in its own change.

Topics are never rendered next to a problem — that would spoil it. **That is the
invariant, and it is about rendering, not about the wire.** They travel on both
public payloads: `/api/olympiads/[olympiad]`, which the olympiad page's topic
filter reads, and `/api/search`, which the ⌘K dialog's does. Both filters run
entirely in the browser over a body it already holds, so withholding them from
one of the two bought nothing but a dialog that could not offer the same filter.

What `/api/search` still excludes is the _haystack_: `searchText` is a join of
olympiad id, name, year, problem number and title, and a topic name has no place
in it. Folding one in would break the documented ranking order and let a visitor
infer a problem's topic by typing "Relativity" and seeing what surfaces — which
is the actual spoiler the original omission was reaching for.

`getSearchIndex` emits `topics: []` for an untagged problem rather than omitting
the key. That is deliberate: it makes `topics === undefined` on the client mean
exactly one thing — "this body was cached before topics shipped" — so the dialog
can hide its topic filter for the day the old payload lingers at the edge instead
of silently matching nothing.

`max_score` is `REAL`, not `INTEGER`: a marking scheme's maximum is not always
whole. It is set per problem in the year editor or in bulk through the
`max_score` column of `titles.csv`.

It **is** part of `ProblemEntry`, omitted rather than nulled when unset, exactly
like `title`. A maximum is the same for every visitor, so it belongs with the
problem's other metadata rather than travelling with one user's progress — but
that also puts it in the shared-cached `/api/olympiads/[olympiad]` body, so
**editing a maximum takes up to a day to appear publicly**, again exactly like
editing a title. A purge is how to expedite it; see
[deployment.md](./deployment.md#purging-the-cache-after-an-api-change).

Nothing short-circuits that wait, on purpose. `?/trackProblem` reads `max_score`
to validate the submitted score and could cheaply return it, but the result
deliberately carries only the score: a maximum reaching the page by a second
route is a second copy that can disagree with the first, and maximums change
rarely enough that the day is an acceptable price for one source of truth.

The visible consequence is worth knowing. Between setting a maximum and the cache
turning over, a scored problem is counted in `unscaled` on the year card and its
mark renders bare, with no `/10`. The score itself is safe — only the denominator
is missing — and a purge fixes it immediately.

### `problem_progress`

One signed-in user's record of one problem.

| Column       | Type       | Notes                                                |
| ------------ | ---------- | ---------------------------------------------------- |
| `id`         | INTEGER PK | autoincrement                                        |
| `user_id`    | TEXT       | → `user.id`, **cascade**                             |
| `problem_id` | INTEGER    | → `problems.id`, **cascade**                         |
| `score`      | REAL       | nullable — null means "completed, no score recorded" |
| `created_at` | INTEGER    | not null, `timestamp_ms`                             |
| `updated_at` | INTEGER    | not null, `timestamp_ms`                             |

Unique on `(user_id, problem_id)`.

**The row's existence _is_ completion.** There is no `completed` column and no
third state: a problem is untracked or done, and a done problem may or may not
carry a score. Un-marking deletes the row.

Both foreign keys cascade, matching `session` and `account` rather than
`activity_log`: progress is the user's own data and should die with the account,
where an audit trail must outlive it.

`updated_at` carries a `$onUpdate`, and Drizzle builds an `on conflict … do
update` SET with the same helper as `db.update` — so the timestamp refreshes on
the conflict branch too. The upsert in
[`queries/progress.ts`](../src/lib/server/db/queries/progress.ts) still sets it
explicitly, which wins over the `$onUpdate`, so the refresh is visible at the
call site rather than implied by the schema.

**Scores are stored exactly as entered** — validated finite and non-negative,
never rounded. Rounding on the way in would make three partial-credit marks of
`8.333` sum to `24.99` where the honest total is `25`. `formatScore` in
[`$lib/progress.ts`](../src/lib/progress.ts) rounds to two decimals for the cards
and the year totals, and for nothing else: a value that will be read back — a
form input seeded from the database, a `titles.csv` cell — goes through
`exactScore` instead, so an exported `max_score` reads back through
`parseMaxScore` unchanged. Seeding an input through the rounding formatter is a
write, not a render; it is how a maximum of `8.333` used to become `8.33` on the
next save of the year.

None of this is ever served from `/api/*`, which is Cloudflare's **shared** cache.
Progress travels on its own from `GET /olympiads/[olympiad]/progress` — outside
`/api/` on purpose, with `cache-control: private, no-store`. The maximum a score
is shown against does not travel with it: it goes out with the problem, as
`ProblemEntry.maxScore`. See
[architecture.md](./architecture.md#why-some-pages-fetch-their-own-data).

That endpoint's body is therefore a `ProgressMap` with **one key per tracked
problem and nothing else**, which is how the row's-existence-is-completion
invariant reaches the wire: an absent key is the only spelling of "untracked",
client-side and server-side alike. There is no `completed` field on either.

`GET /progress` answers the same shape one scope wider, as a
`GlobalProgressMap` — a `ProgressMap` per olympiad id — for the ⌘K dialog, whose
status filter spans the archive. **The nesting is load-bearing, not tidy.**
`progressKey` is `(year, number)` only, so flattening the archive onto those keys
would file IPhO 2019 T1 and APhO 2019 T1 under one key and mark the wrong
problems done, silently and with no visible symptom.

### `file_text`

Extracted plain text for one uploaded document, and the state of its extraction.

| Column               | Type       | Notes                                                                       |
| -------------------- | ---------- | --------------------------------------------------------------------------- |
| `id`                 | INTEGER PK | autoincrement — a rowid alias, which the FTS5 index needs                   |
| `url`                | TEXT       | not null, **unique**; the whole CDN url, byte-identical to the file tables' |
| `status`             | TEXT       | one of the five below                                                       |
| `text`               | TEXT       | nullable; normalised, capped at 512 000 chars. NULL unless `ok`             |
| `chars`, `truncated` | —          | how much was stored, and whether it was cut short                           |
| `etag`, `bytes`      | —          | nullable; only the backfill script fills these                              |
| `ext`                | TEXT       | lowercase, no dot. Decides whether extraction is attempted                  |
| `extractor_version`  | INTEGER    | bump the constant to re-queue every row with no migration                   |
| `engine`             | TEXT       | `browser-pdfjs` or `cli-unpdf`, so a mixed corpus is explicable             |
| `error`, `attempts`  | —          | why it failed, and how many goes it has had                                 |

| status    | meaning                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `pending` | queued; written inline by `uploadFile` as the durability anchor                                              |
| `ok`      | text extracted and stored                                                                                    |
| `empty`   | conversion succeeded and produced nothing — **a scanned PDF**. A first-class, _visible_ state, not a failure |
| `skipped` | extension not extractable (`zip`, legacy `doc`, and `docx`/`xlsx` in the browser)                            |
| `error`   | converter failed; `error` says why, `attempts` bounds the retries                                            |

**Keyed by the whole CDN url, not by a row id.** Renaming a problem number is a
delete plus an insert in `saveMetadata`, which cascades `problem_files` away and
would throw out an extraction for a file whose bytes never moved. Not a content
hash either: that needs 50 MB read _and_ hashed before we can decide to skip it,
for no user-visible gain. The url wins for one decisive reason — it is **already
the join key of both file tables**, so the read path joins straight back and a
row whose url is no longer referenced becomes _invisible rather than wrong_.

**Correctness therefore never depends on cleanup.** `searchFiles` INNER JOINs
`file_text.url` back to `year_files.url` ∪ `problem_files.url`, so a row whose
object is gone is unreachable: it can never produce a result, only waste bytes.
The three cleanup sites — `deleteFile`, `deleteYear` and `saveMetadata`'s orphan
sweep — are hygiene, and all three are best-effort and sit below their action's
"nothing below this line may fail" line.

**There is deliberately no foreign key.** `url` is not unique in either file
table — two labels in one parent may name one object, which is what
`collidingLabel` exists to catch — so a foreign key is not expressible. That is
also why every cleanup is explicit and why the read tolerates a stale row.

The one case where cleanup _would_ matter is **delete-then-re-upload with the
same label and extension**: identical key, identical url, same identity but
different bytes. That is handled by the upsert resetting the row's state, not by
the cleanup having run.

**The text is not a column on `year_files`/`problem_files`**, and that is the
reason for the separate table. Both are read with a bare `db.select()` by
`getYearContent` and fanned out over LEFT JOINs by `getOlympiadYearEntries` and
`getSearchIndex` — the exact shape that once dragged `olympiads.description_md`
onto every row of the corpus. A 40 kB blob on that path would be far worse.

`year_files` and `problem_files` each gained a non-unique `url` index for this.
Without them, every deep search and every backfill sweep is a full scan of both
tables.

**No endpoint may select `file_text.text`.** Only `snippet()` reads it, inside
the FTS5 query, and what leaves the server is a bounded excerpt as plain text
plus match offsets. Keeping that true is what stops the corpus becoming bulk
downloadable, which is a copyright question for third-party papers — and it is
enforced by simply never exposing a query function that returns the column.

### The full-text index

`file_text_fts` is an **FTS5 virtual table**, created by
`20260901125216_file_text_fts/migration.sql` — **the one hand-written migration
in the repository, and the single standing exception to CLAUDE.md rule 1.**

```sql
CREATE VIRTUAL TABLE file_text_fts USING fts5(
  text, content='file_text', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2', prefix='2 3'
);
```

Every choice in it is load-bearing:

- **External content**, not contentless and not plain. Contentless cannot return
  column values, so `snippet()` would be unavailable — that alone rules it out. A
  plain FTS5 table stores a _second_ copy of every text. External content stores
  the index only and reads the column back from `file_text`, which also makes a
  later tokenizer change a `DROP`/`CREATE`/`'rebuild'` with **zero
  re-extraction**.
- **Three triggers, not application-maintained rows.**
  [deployment.md](./deployment.md#ad-hoc-sql) documents `wrangler d1 execute` as
  the supported way to make a bulk correction, and any such hand-edit would
  desync an app-maintained index. A trigger is correct regardless of the writer.
- **`coalesce(…, '')` unconditionally, never a `WHEN` guard.** With external
  content the delete-side value must match what is in the index, or the index
  silently corrupts. Asymmetric guards are exactly how that happens.
- **`prefix='2 3'`** so `gravit*` is an index seek — a ⌘K box is nothing but
  prefix queries. It costs 30–50 % of index size.
- **`remove_diacritics 2`** folds accents, which matters for translated papers.

Both of the last two were confirmed to be accepted by D1's SQLite by applying
this migration; the fallbacks, had they not been, were `1` and dropping `prefix`.

#### Why `db:generate` cannot see it, and why `db:push` must never run

The folder was created with `drizzle-kit generate --custom`, which writes the
`snapshot.json` beside the migration itself — a chained copy of the previous one.
The FTS objects are therefore absent from **every** snapshot _and_ from
`schema.ts`, and `bun run db:generate` diffs exactly those two and **never reads
the database**. It can never emit a `DROP` for them. Run it after applying this
migration and it reports no changes; if it does not, stop.

**`bun run db:push` is the exception to the exception.** It _does_ introspect the
live database, and it will want to drop the virtual table and all three triggers.
Never point it at anything real once this migration is applied.

#### Recovery

The index is disposable. Re-run the DDL and then:

```sql
INSERT INTO file_text_fts(file_text_fts) VALUES('rebuild');
```

Because the index is external-content, that reconstructs it from `file_text` with
**no re-extraction at all**. The admin panel's **Rebuild index** button does both
steps idempotently (`CREATE … IF NOT EXISTS`, then `'rebuild'`).

#### What keeps everything in step

Four separate mechanisms, and it is worth naming them in one place: the
**triggers** keep the index in step with `file_text` for every writer;
**`extractor_version`** keeps `file_text` in step with the pipeline;
**`etag`/`bytes`** keep it in step with R2; and the **url join in the read query**
keeps results in step with the file tables, with no cleanup dependency at all.

## Auth tables

`user`, `session`, `account` and `verification` are BetterAuth's, generated by
`bun run db:generate-auth`. `user` carries the `admin` plugin's `role`, `banned`,
`ban_reason` and `ban_expires`, plus one field of our own:

- **`assigned_olympiads`** — TEXT, not null, default `'[]'`. JSON array of the
  olympiad ids a _contributor_ may edit. Declared to BetterAuth with
  `input: false`, so it can never be set through BetterAuth's own update-user
  endpoint; only the admin panel writes it, directly via Drizzle.

`account` carries one column that is easy to mistake for boilerplate:

- **`issuer`** — TEXT, not null, default `'local:oauth:github'`. BetterAuth 1.7
  identifies an external account by the pair **(`issuer`, `account_id`)**, not by
  `(provider_id, account_id)` as 1.6 did, and enforces it with a unique index.
  For a provider that declares no issuer of its own — GitHub is one — BetterAuth
  writes the synthetic `local:oauth:<encodeURIComponent(providerId)>`, so every
  row here reads `local:oauth:github`.

  The default is load-bearing rather than decorative: SQLite refuses to add a
  NOT NULL column without one, so the default is what let the column be added to
  a populated table _and_ is what backfilled the rows that predate 1.7 — all of
  which were GitHub. BetterAuth always writes `issuer` explicitly on insert, so
  nothing at runtime depends on it. Removing it costs a full table rebuild.

See [auth.md](./auth.md).

## `activity_log`

The admin panel's audit trail, written by `logActivity()`.

| Column        | Notes                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| `user_id`     | → `user.id`, **`ON DELETE SET NULL`** — the log outlives the account       |
| `user_name`   | not null; a _snapshot_ of the name at the time of the action               |
| `action`      | one of eleven enum values; `LogAction` is derived from this column         |
| `olympiad_id` | plain TEXT, **not** a foreign key — deleting an olympiad keeps its history |
| `year`        | nullable                                                                   |
| `detail`      | not null, default `''`; the human-readable sentence                        |

`user_name` is denormalised on purpose: the log has to keep reading sensibly
after an account is renamed or deleted.

## JSON-encoded TEXT columns

SQLite has no array type, so four columns store JSON strings:

| Column                    | Contents         | Parser                                 |
| ------------------------- | ---------------- | -------------------------------------- |
| `years.notes`             | `string[]`       | `parseStringArray`                     |
| `years.extra_links`       | `{label,url}[]`  | `parseLabelledUrls`                    |
| `problems.topics`         | `ProblemTopic[]` | `parseTopics` (`$lib/utils/topics.ts`) |
| `user.assigned_olympiads` | `string[]`       | `parseStringArray`                     |

The parsers in [`$lib/utils/json.ts`](../src/lib/utils/json.ts) are deliberately
**tolerant**: they filter out anything of the wrong type and return an empty
result rather than throwing. Rows predate several schema revisions and are
editable by hand through `wrangler d1 execute`, so a malformed value is a real
possibility — and one bad row must not become a 500 for a whole page.

`parseTopics` goes further and drops _unrecognised_ topic names, keeping the rest
in canonical `PROBLEM_TOPICS` order. That means renaming a topic later degrades
gracefully instead of breaking every row that used the old name.

### `OLYMPIAD_TAGS` is intentionally duplicated

The four tag literals appear both in `$lib/types.ts` and in `schema.ts`'s `enum:`
option. This is not an oversight: **drizzle-kit bundles the schema with its own
resolver, which does not understand the `$lib` alias**, so `schema.ts` cannot
import it. Both copies carry a comment saying so. Keep them in sync.

## R2 key layout

This is the highest-risk string in the codebase, and it lives in one file:
[`$lib/server/storage.ts`](../src/lib/server/storage.ts).

```
icons/olympiads/<olympiadId>.<ext>                            ← olympiad icons
olympiads/<olympiadId>/<year>/<slug>.<ext>                    ← year-level files
olympiads/<olympiadId>/<year>/<problemNumber>/<slug>.<ext>    ← problem files
```

`<slug>` is `slugifyLabel(label)`: lowercased, whitespace → `_`, everything
outside `[a-z0-9_]` dropped. It is defined in
[`$lib/uploads.ts`](../src/lib/uploads.ts) — client-safe, so the editor can apply
it in the browser — and re-exported from `storage.ts`.

**The slug is lossy, and the uniqueness that matters is the slug's, not the
label's.** `year_files` and `problem_files` are unique on the raw `label`, so
`Solutions (official)` and `Solutions official` are two perfectly legal rows that
name one object. `bucket.put` overwrites silently — no error, no versioning, and
the object's metadata is replaced rather than merged — so the second upload would
destroy the first file's bytes, leave both rows holding the same `url`, and let
either row's delete 404 the other. `collidingLabel` in `$lib/uploads.ts` is what
prevents that; `uploadFile` refuses the upload and the editor warns before it.
A label that slugs to _nothing_ (`!!!`) is refused for the same reason.

`<problemNumber>` is **not** slugified — existing keys were built from the raw
number, so normalising it now would orphan them. `saveMetadata` instead refuses a
number containing `/`, which would nest the problem's files a level too deep.

**Keys are never stored.** The database keeps the _whole_ CDN URL
(`https://cdn.phoxiv.org/<key>`) in its `url` columns, and deletion recovers the
key by stripping the `CDN_BASE_URL` prefix back off:

```
url column  ──keyFromCdnUrl()──→  key  ──bucket.delete()──→  gone
```

Three consequences follow, and all three are silent failures:

1. **Changing `CDN_BASE_URL`** ([`$lib/constants.ts`](../src/lib/constants.ts))
   orphans every existing object _and_ breaks deletion for every existing row —
   `keyFromCdnUrl` returns `null` for a URL that no longer matches the prefix, and
   `deleteByUrl` quietly no-ops.
2. **Changing the key layout or `slugifyLabel`** does the same for anything
   uploaded afterwards.
3. **`deleteByUrl` must only ever be given a URL read back from the database.**
   A client-submitted value would let a crafted URL delete an arbitrary object.
   Every call site reads the row first.

Icons are keyed _by extension_, so uploading a `.png` over an existing `.svg`
would leave the old file live on the CDN. `deleteStaleIcons` removes the other
extensions before the write.

### What may be uploaded

Declared once, client-safe, in [`$lib/uploads.ts`](../src/lib/uploads.ts) so the
form's `accept` attribute and the server's allow-list cannot drift apart:

| Spec              | Extensions                           | Max   |
| ----------------- | ------------------------------------ | ----- |
| `ICON_UPLOAD`     | svg, png, jpg, jpeg, webp, avif      | 2 MB  |
| `DOCUMENT_UPLOAD` | pdf, xlsx, zip, doc, docx, htm, html | 50 MB |
| `CSV_UPLOAD`      | csv                                  | 1 MB  |

`accept` is a hint to the file picker and nothing more;
[`$lib/server/uploads.ts`](../src/lib/server/uploads.ts) is where the rules are
actually enforced. **The extension decides the stored `Content-Type`, never
`file.type`** — the browser's MIME type is attacker-controlled, and R2 would
serve an HTML payload back with whatever type it was told, from our own CDN
origin.

## The `titles.csv` contract

`GET /contribute/<olympiad>/titles.csv` exports every problem title, topic set
and maximum score; the `importTitles` action reads the same format back. The two
are a contract, and the export endpoint says so.

```
year,number,title,topics,max_score
2019,T1,Physics of a Slinky,Mechanics;Waves and Optics,10
2019,T2,,,
```

- **Header row** with `year`, `number`, `title` — `topics` and `max_score` are
  both optional, so every CSV exported before either existed still imports.
  Header names are trimmed and lowercased on import.
- **Topics are `;`-separated**, because `,` is the CSV delimiter itself.
  Unrecognised names are dropped rather than failing the import.
- **`max_score` is snake_case** where the other columns happen to be single
  words. It has to be: the import lowercases header names, so a `maxScore`
  column would arrive as `maxscore` and never be read. A cell that is not a
  number greater than zero is ignored rather than failing the whole import — the
  same tolerance shown to an unrecognised topic — but it is counted and reported
  in the summary toast, so a typo is visible instead of silent.
- **A leading UTF-8 BOM** and **CRLF line endings**, without which Excel misreads
  accented titles.
- Fields are quoted only when they contain `"`, `,`, CR or LF.

The import is **fill-only by design**: an existing problem is never overwritten,
only completed — a maximum score already set through the year editor survives a
re-import that carries a different one. Missing years are created. A re-import
therefore cannot clobber work done through the year editor, which is what makes
the round-trip safe to repeat.

## Migration workflow

```sh
# 1. edit src/lib/server/db/schema.ts
bun run db:generate        # drizzle-kit writes migrations/<timestamp>_<name>/
bun run db:migrate         # apply to the LOCAL D1
bun run db:migrate-remote  # apply to the production D1
```

Since the Drizzle v1 upgrade each migration is a **folder** holding a
`migration.sql` and the `snapshot.json` it was diffed against — there is no
top-level `meta/` directory and no `_journal.json` any more. Wrangler does not
find that layout on its own, which is why the `DB` binding sets
`migrations_pattern` as well as `migrations_dir`; see
[deployment.md](./deployment.md#migrations-against-production).

**Never hand-edit anything under `src/lib/server/db/migrations/`** — with **one
documented exception**, the FTS5 virtual table and its triggers. The
`migration.sql` and the `snapshot.json` beside it are generated together; editing
one leaves drizzle-kit's idea of the schema out of step with the database's, and
the next generated migration will be wrong.

The exception is contained rather than granted. `drizzle-kit generate --custom`
creates the folder _and_ writes a correct chained `snapshot.json` itself, so only
the SQL body is hand-authored and the invariant the rule protects — drizzle's
idea of the schema staying in step with the database's — is preserved. See
[The full-text index](#the-full-text-index) for the whole argument, including
**the `db:push` hazard**.

Two columns look like they should carry `.unique()` and deliberately do not —
`user.email` and `session.token` are declared with an explicit `uniqueIndex`
instead. The reason is recorded in `schema.ts`: drizzle-kit v1 renders `.unique()`
as an inline column constraint, which SQLite cannot add to an existing table, so
`db:generate` would emit a full rebuild of `user` and `session` for no logical
change.

`bun run db:push` exists for throwaway local experiments. It skips the migration
files entirely, so anything it does is invisible to the deployed database — do
not use it on a schema change you intend to ship. **Since the FTS5 migration it
is worse than that**: `db:push` introspects the live database, sees a virtual
table and three triggers that appear in no snapshot, and offers to drop them.
Never point it at anything you care about.

If the schema change touched an auth table, regenerate BetterAuth's half first
(`bun run db:generate-auth`), then run `db:generate`.
