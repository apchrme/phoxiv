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

Topics are never rendered next to a problem — that would spoil it. They exist
only to drive the topic filter on the olympiad page, and `/api/search`
deliberately omits them for the same reason.

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

`updated_at` carries a `$onUpdate`, which Drizzle only fires for `db.update` — so
the upsert in [`queries/progress.ts`](../src/lib/server/db/queries/progress.ts)
sets it explicitly in its `onConflictDoUpdate`.

**Scores are stored exactly as entered** — validated finite and non-negative,
never rounded. Rounding on the way in would make three partial-credit marks of
`8.333` sum to `24.99` where the honest total is `25`. `formatScore` in
[`$lib/progress.ts`](../src/lib/progress.ts) rounds to two decimals for display
only, and is the single formatter for the cards, the year totals and the CSV, so
an exported `max_score` always reads back through `parseMaxScore` unchanged.

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
| `action`      | one of ten enum values; `LogAction` is derived from this column            |
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

**Never hand-edit anything under `src/lib/server/db/migrations/`.** The
`migration.sql` and the `snapshot.json` beside it are generated together; editing
one leaves drizzle-kit's idea of the schema out of step with the database's, and
the next generated migration will be wrong.

Two columns look like they should carry `.unique()` and deliberately do not —
`user.email` and `session.token` are declared with an explicit `uniqueIndex`
instead. The reason is recorded in `schema.ts`: drizzle-kit v1 renders `.unique()`
as an inline column constraint, which SQLite cannot add to an existing table, so
`db:generate` would emit a full rebuild of `user` and `session` for no logical
change.

`bun run db:push` exists for throwaway local experiments. It skips the migration
files entirely, so anything it does is invisible to the deployed database — do
not use it on a schema change you intend to ship.

If the schema change touched an auth table, regenerate BetterAuth's half first
(`bun run db:generate-auth`), then run `db:generate`.
