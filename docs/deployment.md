# Deployment

The whole app is one Cloudflare Worker, built by
[`@sveltejs/adapter-cloudflare`](https://svelte.dev/docs/kit/adapter-cloudflare)
and deployed with wrangler.

## What `wrangler.jsonc` declares

| Key                  | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| `name`               | `phoxiv`                                                   |
| `main`               | `.svelte-kit/cloudflare/_worker.js` — the adapter's output |
| `compatibility_date` | `2026-04-24`, with `nodejs_compat`                         |
| `route`              | `phoxiv.org`, as a custom domain                           |
| `observability`      | enabled                                                    |

### Bindings

| Binding  | Kind   | Notes                                                                                                                                          |
| -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASSETS` | assets | `.svelte-kit/cloudflare` — the static build output                                                                                             |
| `DB`     | D1     | database `phoxiv`; `migrations_dir` points at `src/lib/server/db/migrations`, with `migrations_pattern` for Drizzle v1's per-migration folders |
| `FILES`  | R2     | bucket `phoxiv-files`                                                                                                                          |

**Three bindings, and the shortness of that list is a standing design
constraint rather than an accident.** Full-text search — the most infrastructural
feature in the app — added none of them: the PDF parser lives in the browser and
the backfill script runs on a maintainer's machine, so it needed no binding, no
`wrangler.jsonc` edit and no `cf-typegen` run. Reach for a plain library, a
browser-side step or a local script before a fourth binding; see
[Why the PDF parser is not in the Worker](#why-the-pdf-parser-is-not-in-the-worker)
for what that trade looked like with real numbers.

The app reads these off `platform.env`. `DB` is reached through `locals.db`
(built once per request in `hooks.server.ts`); `FILES` through `getBucket()` in
`$lib/server/storage.ts`, which returns `null` when the binding is absent so a
form action can `fail()` with a toast instead of replacing the page with an
error template.

After editing bindings, regenerate the ambient types:

```sh
bun run cf-typegen        # rewrites src/worker-configuration.d.ts
bun run cf-typegen:check  # verifies it is up to date, without writing
```

### Environment variables

`BETTER_AUTH_URL` is a plain `var` in `wrangler.jsonc` (`https://phoxiv.org/`).
Everything else is a **Worker secret**:

```sh
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
bunx wrangler secret put TRUSTED_ORIGINS
bunx wrangler secret put SUPERADMIN_EMAIL     # optional
```

`.env.example` documents what each one is. Locally the same values live in
`.env`; see [contributing.md](./contributing.md).

The CDN origin is **not** an environment variable — `CDN_BASE_URL` is a constant
in [`$lib/constants.ts`](../src/lib/constants.ts), because it is baked into every
`url` already stored in D1. Changing it orphans every object in the bucket; see
[data-model.md](./data-model.md#r2-key-layout).

## Deploying

```sh
bun run format && bun run check && bun run lint   # the gates
bun run preview                                   # build + wrangler dev, locally
bun run deploy                                    # build + wrangler deploy
```

`deploy` is `bun run build && wrangler deploy`, so a failing build never reaches
Cloudflare. `preview` is the same build served through `wrangler dev`, which is
the only local mode that exercises the real Worker runtime and the real bindings.

## Migrations against production

Migration files are generated locally, committed, and applied to the remote
database as a separate step:

```sh
bun run db:generate        # after editing schema.ts — writes migrations/<timestamp>_<name>/
bun run db:migrate         # local D1
bun run db:migrate-remote  # production D1  (wrangler d1 migrations apply DB --remote)
```

Wrangler identifies an applied migration by the **path** it matched, relative to
`migrations_dir`, and stores that string in the `d1_migrations` table. Under the
Drizzle v1 layout that is `<timestamp>_<name>/migration.sql`, which is why the
`DB` binding must set `migrations_pattern` — with wrangler's default `*.sql` it
matches nothing and reports "No migrations folder found".

Because the name _is_ the identity, renaming a migration folder makes an
already-applied migration look new and wrangler will try to run it again. Check
what production believes before applying anything after a layout change:

```sh
bunx wrangler d1 migrations list DB --remote
```

Order matters when a change is not backwards-compatible: apply the migration
**before** deploying code that depends on it if the change is additive, and
**after** if it removes something the running code still reads. Most changes here
are additive.

`db:push` never touches production and must not be used for anything you intend
to ship — it bypasses the migration files entirely, so the remote database would
have no record of the change.

### Ad-hoc SQL

```sh
bunx wrangler d1 execute DB --remote --command "SELECT count(*) FROM problems;"
bunx wrangler d1 execute DB --remote --file=path/to/statements.sql
```

This is how the database was originally seeded, and it remains the way to make a
bulk correction that the contribute UI cannot express. Remember that
`years.notes`, `years.extra_links`, `problems.topics` and `user.assigned_olympiads`
hold **JSON strings** — the parsers tolerate malformed values by returning empty,
so a bad hand-edit shows up as silently missing data rather than an error.

## Bulk-loading R2

For anything larger than a handful of files, [rclone](https://rclone.org/) against
an R2 remote beats the contribute UI:

```sh
rclone sync files/ r2:phoxiv-files/ --progress
```

`files/` is gitignored precisely so it can be used as a local scratch copy of the
bucket. The directory layout must match the key layout exactly —
`olympiads/<id>/<year>/[<problem>/]<slug>.<ext>` and
`icons/olympiads/<id>.<ext>` — because the database's `url` columns are written
independently and nothing reconciles the two. An object at the wrong key is
invisible; a row pointing at a missing object is a dead link.

## Why the PDF parser is not in the Worker

Text extraction for deep search runs in the **contributor's browser**, and the
one-time backfill of everything older runs in a local `bun` script. The Worker
never parses a PDF, holds no PDF library, and gained no binding for any of it.

The reason is a measurement, not a preference:

|                                                         | gzipped       |
| ------------------------------------------------------- | ------------- |
| the whole phoXiv server bundle, before full-text search | 0.396 MB      |
| the whole phoXiv server bundle, after                   | 0.425 MB      |
| pdf.js, if it were bundled into the Worker              | **≈ +0.5 MB** |

A Worker-side parser would be **larger than the entire application**, and that
size is paid as cold-start parse time on _every_ route, to serve a path that runs
a few times a month. It would fit inside the 10 MB limit; it is simply
disproportionate.

### The bundle check

This is the one command that keeps the design honest, and it belongs in the gates
for any change near `$lib/pdf-text.ts`:

```sh
bun run build && find .svelte-kit/output/server -name '*.js' -print0 \
  | xargs -0 cat | gzip -9 -c | wc -c
```

**≈ 425 000 bytes is right. ≈ 900 000 means pdf.js was resolved into the server
build** — the dynamic import got resolved at build time and must go back to the
runtime-URL form. Everything still _works_ when that happens, which is exactly
why it needs a number rather than a glance.

Two supporting checks when it looks wrong:

```sh
grep -rl GlobalWorkerOptions .svelte-kit/output/server/   # must find nothing
ls .svelte-kit/cloudflare/vendor/pdfjs/                   # must list the build
```

A 404 on the second is a silent no-extraction: uploads keep succeeding and every
row quietly lands `pending`.

### The vendored build

`static/vendor/pdfjs/` holds `pdf.min.mjs` and `pdf.worker.min.mjs`, copied
verbatim from a pinned `pdfjs-dist` — the version is recorded in the README
beside them, along with the update procedure. About 1.7 MB is checked into git,
in keeping with the vendored `src/lib/components/ui/`, and it costs the Worker
nothing: these are static assets served by `ASSETS`, not Worker script size.

`$lib/pdf-text.ts` reaches them through a **runtime string URL**:

```ts
const pdfjs = await import(/* @vite-ignore */ '/vendor/pdfjs/pdf.min.mjs');
```

The `@vite-ignore` and the non-literal specifier are the whole point. A dynamic
import Vite _can_ resolve joins the module graph, and Rollup then emits it into
the **server** build as well — which `adapter-cloudflare` bundles into the Worker.
A runtime string is the only form guaranteed absent from both bundles. Do not
"tidy" it into a static import.

The two files must come from the same `pdfjs-dist` version: pdf.js refuses to run
a worker whose version does not match the API's.

## Backfilling the text index

New uploads are indexed as they arrive. Everything already in R2 is swept up by:

```sh
PHOXIV_URL=https://phoxiv.org PHOXIV_SESSION='<cookie>' bun run index:backfill
```

```powershell
# PowerShell has no inline env-var prefix, so the sh form above is a parse error there
$env:PHOXIV_URL = 'https://phoxiv.org'; $env:PHOXIV_SESSION = '<cookie>'; bun run index:backfill
```

`PHOXIV_SESSION` is the **value** of the session cookie, copied from a signed-in
**admin** browser. Clunky, and deliberately so: a shared-secret header would be a
second authentication mechanism in a codebase whose [auth.md](./auth.md) is
narrow on purpose, and the cookie adds no new secret and no new auth path.

**Mind the cookie's name.** BetterAuth prefixes it with `__Secure-` whenever it
believes it is in production, so the two environments do not agree:

| Origin                  | Cookie                               |
| ----------------------- | ------------------------------------ |
| `https://phoxiv.org`    | `__Secure-better-auth.session_token` |
| `http://localhost:5173` | `better-auth.session_token`          |

Copying the wrong one fails **in a way that looks like a permission problem**:
the Worker sees no session at all, and `requireAdmin` answers that with the same
`403 Unauthorised` it gives a signed-in non-admin. The script now sends the value
under both names to sidestep the question entirely, and asks
`/api/auth/get-session` who it is before fetching any work — so a rejected cookie
says so, instead of surfacing as a bare 403 from `/admin/reindex`. A token is
only valid for the origin that issued it: a localhost session means nothing to
`phoxiv.org`.

The script loops until nothing is left, so re-running it is always safe:

- The work queue is **derived, not stored** — no queue table and no cursor.
  Processing a candidate writes its row, which removes it from the set, so
  idempotency and resumability are free.
- Because the candidate set _is_ the file tables, files loaded out of band by
  rclone (see [Bulk-loading R2](#bulk-loading-r2), where the D1 rows are written
  independently) are picked up automatically. An event-driven queue would miss
  them entirely.
- A file that fails three times drops out of the set, so one poison document
  cannot block the queue forever. It shows up under **Failures** in the admin
  panel's Index tab.
- Bytes come from the local `files/` rclone mirror when it is there and from the
  public CDN url otherwise, so **no R2 credentials are needed**.
- The script reads `.docx` and `.xlsx` as well as PDF and HTML — locally,
  dependency weight is free, so `unpdf` and `fflate` are devDependencies and
  never enter either bundle.

Results travel over HTTP rather than `wrangler d1 execute`, and that is not a
style choice: D1 caps a _statement_ at 100 KB, which a 40 kB–500 kB text blows
through once escaped, and `--command` additionally hits Windows' 8191-character
command-line limit. Posting to `/admin/reindex` sends the text as a **bound
parameter**, so only D1's 2 MB row limit applies.

After a large run, press **Merge segments** once in the admin panel.

### Measuring the corpus

```sh
bunx wrangler d1 execute DB --remote --command \
  "SELECT count(*) FROM (SELECT url FROM year_files UNION SELECT url FROM problem_files);"

# after the backfill
bunx wrangler d1 execute DB --remote --command \
  "SELECT count(*), sum(length(text)), max(length(text)) FROM file_text;"
```

Rough estimate to check the answer against: a page of dense physics text is about
3 kB normalised and a twelve-page problem set about 40 kB; an external-content
FTS5 index is 30–60 % of the source text, and `prefix='2 3'` adds 30–50 % of
that. So roughly 70 kB per 40 kB file — **1 000 files ≈ 70 MB, 5 000 files ≈
350 MB**. Free D1 is 500 MB; paid is 10 GB and effectively unbounded.

## Staying inside D1's daily quotas

Free D1 allows **5,000,000 rows read** and **100,000 rows written** per day, and
since 2026-09-01 Cloudflare _enforces_ them rather than merely metering: once a
limit is hit, queries **fail until midnight UTC**. On this project a quota
overrun is a total outage, not a slow afternoon, which is what justifies leaving
generous headroom.

Reads are not the meter to watch. Steady-state traffic sits at **180,000–330,000
rows read per day** — around 5 % of the ceiling, and flat — on roughly 1,500
olympiad page views per day.

**Rows written is the tighter of the two.** One full re-index sweep of ~2,250
files wrote **14,228 rows, 14 % of the daily write cap**, because every
`file_text` write fans out through the FTS triggers. Two or three sweeps in a day
— an `EXTRACTOR_VERSION` bump, a tokenizer change, a couple of index rebuilds —
would approach the write limit long before the read limit came into view. Spread
them across days, and prefer one sweep that covers everything to several narrow
ones.

Ask the numbers rather than estimating them. The GraphQL analytics API answers
both meters per day:

```sh
curl -s https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"query":"query($account:String!,$from:Date!,$to:Date!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:100,filter:{date_geq:$from,date_leq:$to},orderBy:[date_DESC]){dimensions{date databaseId} sum{readQueries writeQueries rowsRead rowsWritten}}}}}","variables":{"account":"<account id>","from":"2026-08-18","to":"2026-09-05"}}'
```

Swap `d1AnalyticsAdaptiveGroups` for `d1QueriesAdaptiveGroups` to get the same
window broken down **per query**, which is how the deep-search snippet cost in
[search.md](./search.md) was found — it reported 2,243 rows per call against an
estimate of "a few hundred". Two fields that look like they should exist do not:
`queryBatchTimeMs` and `queryHash` are not on either dataset.

For a single query, `wrangler d1 execute --remote --json` reports `rows_read` in
its `meta`, which is the cheapest way to check a change before shipping it —
compare the two variants directly instead of reasoning about the plan.

**The paid plan is the backstop, not the plan.** Workers Paid is $5/month and
includes about 25 billion rows/month, so if rows read run sustained above
**~3,500,000/day** or rows written above **~70,000/day**, upgrade rather than
optimise further; the archive going dark is worth more than $5. At current
volumes that trigger is a long way off, and the free-tier quotas are treated as
engineering constraints in the meantime — the same posture as the
[three-binding limit](#bindings).

## Purging the cache after an API change

This is the step that is easy to forget.

`/api/*` responses are held in **Cloudflare's shared cache** with
`s-maxage=86400`. A wrong or changed payload therefore persists for up to a day.
Editing content through `/contribute` has the same delay — the contribute page
says so in its own description.

That day is the whole of it. `max-age=0, must-revalidate` on those responses is
deliberate: a browser may still store a copy, but it may not reuse one without
revalidating first, so a dashboard purge reaches every visitor on their next
request — returning visitors included.

After deploying a change to any `/api/*` **response shape**:

1. Cloudflare dashboard → the `phoxiv.org` zone → **Caching → Configuration**.
2. **Purge Everything**, or purge by URL for the affected endpoints:
   - `https://phoxiv.org/api/olympiads`
   - `https://phoxiv.org/api/olympiads/<id>` (one per olympiad)
   - `https://phoxiv.org/api/search`
   - `https://phoxiv.org/api/stats`
3. Reload the site and confirm the new shape is being served.

**`/api/search/files` can only be cleared by Purge Everything.** Its bodies are
keyed by query string, so there is no finite list of URLs to enumerate and
purge-by-URL cannot reach them. If you change that endpoint's response shape,
Purge Everything is the only option — plan for it rather than discovering it.

The public shapes are near-frozen for this reason — `OlympiadEntry[]`,
`YearEntry[]`, `SearchItem[]`, `FileSearchResponse` and the stats triple. A newly
deployed client
paired with a day-old cached payload is the failure mode to think about before
changing one.

`SearchItem[]` gained `problem.topics` when the ⌘K dialog got the olympiad page's
two filters, and that change is the reason `getSearchIndex` emits `topics: []`
rather than omitting the key for an untagged problem: on the client `undefined`
then means exactly "this body predates the field", which is what lets the dialog
hide the topic filter for the day the old payload lingers instead of offering a
filter that silently matches nothing. **Purge after deploying that change.**
Skipping it costs a day in which the ⌘K dialog has no topic filter — degraded,
not wrong.

`YearEntry[]`'s problems carry `maxScore`, which makes the delay a _content_
problem and not only a deploy-time one: a contributor raising a problem's maximum
sees it in the year editor at once, but the olympiad page keeps showing the old
denominator for up to a day, exactly as it does for an edited title. A purge of
`https://phoxiv.org/api/olympiads/<id>` is how to expedite it, and there is no
in-app path that beats it: `?/trackProblem` deliberately does not send the
maximum back to the page, so that the shared-cached payload stays the one source
of it.

**A purge reaches every visitor on their next request.** `must-revalidate`
stops a browser serving a copy it already holds without checking with the edge
first, so there is no returning-visitor lag to wait out and no second load to
account for. Once the purge has landed there is nothing else holding the old
payload. See
[architecture.md](./architecture.md#why-some-pages-fetch-their-own-data).

Skipping the purge after a shape change to `YearEntry[]` is survivable rather
than destructive: a fresh client reading a day-old body renders scores bare, with
no `/10` and every scored problem counted as `unscaled` in the year ratio. It is
a stale denominator, not lost data, and it self-heals when the cache turns over.

`/api/auth/[...all]` sets no cache headers at all and must never be given any.
