# Deployment

The whole app is one Cloudflare Worker, built by
[`@sveltejs/adapter-cloudflare`](https://svelte.dev/docs/kit/adapter-cloudflare)
and deployed with wrangler.

## What `wrangler.jsonc` declares

| Key                  | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| `name`               | `phoxiv`                                                  |
| `main`               | `.svelte-kit/cloudflare/_worker.js`, the adapter's output |
| `compatibility_date` | `2026-04-24`, with `nodejs_compat`                        |
| `route`              | `phoxiv.org`, as a custom domain                          |
| `observability`      | enabled                                                   |

### Bindings

| Binding  | Kind   | Notes                                                                                                                     |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| `ASSETS` | assets | `.svelte-kit/cloudflare`, the static build output                                                                         |
| `DB`     | D1     | database `phoxiv`. `migrations_dir` is `src/lib/server/db/migrations`, and `migrations_pattern` matches `*/migration.sql` |
| `FILES`  | R2     | bucket `phoxiv-files`                                                                                                     |

Keep it to three. Before adding a fourth binding, try a plain library, a step in
the browser, or a local script. Full-text search needed no new binding: the PDF
parser runs in the browser and the backfill runs on a maintainer's machine.

The app reads bindings from `platform.env`. `DB` is reached through `locals.db`.
`FILES` is reached through `getBucket()` in `$lib/server/storage.ts`, which
returns `null` when the binding is missing so a form action can `fail()` with a
toast instead of showing an error page.

After editing bindings, regenerate the types:

```sh
bun run cf-typegen        # rewrites src/worker-configuration.d.ts
bun run cf-typegen:check  # checks it is up to date, without writing
```

### Environment variables

`BETTER_AUTH_URL` is a plain `var` in `wrangler.jsonc` (`https://phoxiv.org/`).
The rest are Worker secrets:

```sh
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put GITHUB_CLIENT_ID
bunx wrangler secret put GITHUB_CLIENT_SECRET
bunx wrangler secret put TRUSTED_ORIGINS
bunx wrangler secret put SUPERADMIN_EMAIL     # optional
```

`.env.example` explains each one. Locally they live in `.env`; see
[contributing.md](./contributing.md#first-run).

The CDN origin is not an environment variable. `CDN_BASE_URL` is a constant in
[`$lib/constants.ts`](../src/lib/constants.ts) because every `url` in D1 contains
it. Never change it; see [data-model.md](./data-model.md#r2-key-layout).

## Deploying

```sh
bun run format && bun run check && bun run lint   # the gates, less the build deploy runs
bun run preview                                   # build + wrangler dev, locally
bun run deploy                                    # build + wrangler deploy
```

`deploy` runs `bun run build && wrangler deploy`, so a failed build never ships.
The per-commit gates in [contributing.md](./contributing.md#the-gates) include
the build too, so a broken build is caught before it is committed.
`preview` serves the same build through `wrangler dev`. It is the only local mode
that runs the real Worker runtime.

After deploying, check whether you also need to:

- [purge the cache](#purging-the-cache-after-an-api-change), if anything an
  `/api/*` endpoint returns has changed;
- [run the backfill](#backfilling-the-text-index), if the change touched text
  extraction. Rows that landed `pending` stay `pending` until something reads
  them.

## Migrations against production

Generate migrations locally, commit them, then apply them to production as a
separate step:

```sh
bun run db:generate        # after editing schema.ts
bun run db:migrate         # local D1
bun run db:migrate-remote  # production D1  (wrangler d1 migrations apply DB --remote)
```

Wrangler records each applied migration by its path relative to
`migrations_dir` (for example `<timestamp>_<name>/migration.sql`) in the
`d1_migrations` table. Two consequences:

- The `DB` binding must set `migrations_pattern`. With wrangler's default
  `*.sql` it finds nothing and reports "No migrations folder found".
- Renaming a migration folder makes an applied migration look new, and wrangler
  will try to run it again. Before applying anything after a layout change, check
  what production has recorded:

```sh
bunx wrangler d1 migrations list DB --remote
```

Order matters for changes that are not backwards-compatible. Apply an additive
migration before deploying the code that needs it. Apply a migration that removes
something after deploying the code that stops reading it.

Never use `db:push` for anything you intend to ship. It bypasses the migration
files, and it will try to drop the search index; see
[data-model.md](./data-model.md#the-full-text-index).

### Ad-hoc SQL

```sh
bunx wrangler d1 execute DB --remote --command "SELECT count(*) FROM problems;"
bunx wrangler d1 execute DB --remote --file=path/to/statements.sql
```

Use this for bulk corrections the contribute UI cannot make. Four columns hold
JSON strings (see [data-model.md](./data-model.md#json-encoded-text-columns)).
Their parsers turn malformed values into empty ones, so a bad hand edit shows up
as missing data, not as an error.

## Bulk-loading R2

For more than a handful of files, use [rclone](https://rclone.org/) with an R2
remote instead of the contribute UI:

```sh
rclone sync files/ r2:phoxiv-files/ --progress
```

`files/` at the repo root is gitignored so it can hold a local copy of the
bucket. Its layout must match the [key layout](./data-model.md#r2-key-layout)
exactly: `olympiads/<id>/<year>/[<problem>/]<slug>.<ext>` and
`icons/olympiads/<id>.<ext>`. The D1 rows are written separately and nothing
reconciles the two. An object at the wrong key is invisible, and a row pointing
at a missing object is a dead link.

## Why the PDF parser is not in the Worker

Text extraction runs in the contributor's browser. The backfill of older files
runs in a local `bun` script. The Worker never parses a PDF and holds no PDF
library.

pdf.js is about 0.5 MB gzipped. The whole server bundle is about 0.43 MB. A
Worker-side parser would more than double it, and every route would pay for that
in cold-start time, to serve a path that runs a few times a month.

### The bundle check

Run this for any change near `$lib/pdf-text.ts` or the vendored build:

```sh
bun run build && find .svelte-kit/output/server -name '*.js' -print0 \
  | xargs -0 cat | gzip -9 -c | wc -c
```

A little over 430 000 bytes is right. About 900 000 means pdf.js got bundled into
the server build, and the import must go back to the runtime-URL form below. The
number drifts by a percent or two with ordinary changes; you are looking for a
doubling. Everything still works when pdf.js leaks in, which is why this needs a
number.

Two exact checks, to trust when the number is unclear:

```sh
grep -rl GlobalWorkerOptions .svelte-kit/output/server/   # must find nothing
ls .svelte-kit/cloudflare/vendor/pdfjs/                   # must list the build
```

If the second fails, the parser 404s in production. Uploads keep working, but
every row lands `pending`.

`$lib/pdf-text.ts` imports pdf.js's types from the `pdfjs-dist` devDependency
with `import type`, which TypeScript erases. Don't drop the `type` keyword or
import a runtime value from that module: that puts the parser in the Worker.
Don't swap in hand-written types either; they let a call to a removed pdf.js
method pass `svelte-check`.

### The vendored build

`static/vendor/pdfjs/` holds `pdf.min.mjs` and `pdf.worker.min.mjs`, copied from
a pinned `pdfjs-dist`. The README beside them records the version and the update
steps. Both files must come from the same version, because pdf.js refuses a
worker whose version differs. They are static assets served by `ASSETS`, so they
add nothing to the Worker's size.

`$lib/pdf-text.ts` loads them through a runtime string URL:

```ts
const PDFJS_URL = '/vendor/pdfjs/pdf.min.mjs';
// …
pdfjsPromise ??= import(/* @vite-ignore */ PDFJS_URL).then(/* set workerSrc */);
```

Don't turn this into a normal import. If Vite can resolve an import, Rollup also
puts it in the server build, which the adapter bundles into the Worker. A runtime
string is the only form kept out of both bundles.

## Backfilling the text index

New uploads are indexed when the contributor's browser manages to read them. If
it cannot (JavaScript off, a 404 on the parser, a parser error), the upload still
succeeds and the row lands `pending`. Those rows, and every file uploaded before
search existed, are handled by the backfill script:

```sh
PHOXIV_URL=https://phoxiv.org PHOXIV_SESSION='<cookie>' bun run index:backfill
```

```powershell
# PowerShell has no inline env-var prefix, so the sh form above is a parse error there
$env:PHOXIV_URL = 'https://phoxiv.org'; $env:PHOXIV_SESSION = '<cookie>'; bun run index:backfill
```

`PHOXIV_SESSION` is the value of the session cookie from a browser signed in as
an admin. This reuses the existing auth path instead of adding a shared secret;
see [auth.md](./auth.md).

The cookie name differs by environment:

| Origin                  | Cookie                               |
| ----------------------- | ------------------------------------ |
| `https://phoxiv.org`    | `__Secure-better-auth.session_token` |
| `http://localhost:5173` | `better-auth.session_token`          |

The script sends the value under both names and checks `/api/auth/get-session`
before doing any work, so a bad cookie is reported clearly. A token only works on
the origin that issued it.

How the script behaves:

- Re-running it is always safe. There is no queue table: the work list is derived
  from the file tables, so it also picks up files loaded
  [by rclone](#bulk-loading-r2).
- A file that fails three times drops out and appears under **Failures** in the
  admin panel's Index tab. Until then a `pending` row stays retryable, so one run
  repairs any spell of failed browser extraction.
- If the Worker fails to save a result (a D1 error), it still saves the rest of
  the batch and reports the failed urls. The script then stops and lists them;
  the error itself is in the Worker logs. Rerun once D1 is healthy.
- It reads bytes from the local `files/` mirror if present, otherwise from the
  public CDN, so it needs no R2 credentials. It also reads `.docx` and `.xlsx`,
  using devDependencies that never enter either bundle.
- It posts results to `/admin/reindex`, with the text as a bound parameter.
  Don't switch to `wrangler d1 execute`: D1 caps a statement at 100 KB, and
  `--command` hits Windows' 8191-character command-line limit.

**Don't bump `EXTRACTOR_VERSION` to force a re-run.** The bump is for changes to
what extraction produces, and it re-queues the whole archive at 14 % of the daily
write quota (see [below](#staying-inside-d1s-daily-quotas)).

To confirm a run worked, press **Refresh** on the Index tab's Maintenance card:
`pending` should fall and `ok` rise. The tab never refreshes its counts on its
own, because reading them costs thousands of D1 rows. After a large run, press
**Merge segments** once.

### Measuring the corpus

```sh
bunx wrangler d1 execute DB --remote --command \
  "SELECT count(*) FROM (SELECT url FROM year_files UNION SELECT url FROM problem_files);"

# after the backfill
bunx wrangler d1 execute DB --remote --command \
  "SELECT count(*), sum(length(text)), max(length(text)) FROM file_text;"
```

Rough estimate: stored text plus its index costs about 70 kB per typical 40 kB
file, so 1,000 files is about 70 MB and 5,000 about 350 MB. Free D1 allows
500 MB.

## Staying inside D1's daily quotas

phoXiv stays on Cloudflare's free tier. Free D1 allows **5,000,000 rows read**
and **100,000 rows written** per day. Cloudflare enforces these: once a limit is
hit, every query fails until midnight UTC. A quota overrun is a full outage, so
leave plenty of headroom.

- **Reads** are not the concern. Normal traffic reads 180,000–330,000 rows a day,
  about 5 % of the limit.
- **Writes** are the tighter limit. One full re-index sweep writes about 14,000
  rows (14 % of the limit), because each `file_text` write fans out through the
  FTS triggers. Spread sweeps, tokenizer changes and index rebuilds across days,
  and prefer one sweep that covers everything over several narrow ones.

Check the real numbers instead of estimating. The GraphQL analytics API gives
both meters per day:

```sh
curl -s https://api.cloudflare.com/client/v4/graphql \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"query":"query($account:String!,$from:Date!,$to:Date!){viewer{accounts(filter:{accountTag:$account}){d1AnalyticsAdaptiveGroups(limit:100,filter:{date_geq:$from,date_leq:$to},orderBy:[date_DESC]){dimensions{date databaseId} sum{readQueries writeQueries rowsRead rowsWritten}}}}}","variables":{"account":"<account id>","from":"2026-08-18","to":"2026-09-05"}}'
```

Replace `d1AnalyticsAdaptiveGroups` with `d1QueriesAdaptiveGroups` for a
per-query breakdown. `queryBatchTimeMs` and `queryHash` do not exist on either
dataset.

To check one query before shipping it, run it with
`wrangler d1 execute --remote --json` and read `rows_read` in the `meta`. Compare
variants directly instead of reasoning about the query plan.

The paid plan is a backstop, not the plan. Workers Paid costs $5/month. Upgrade
rather than optimise further if reads stay above about **3,500,000/day** or
writes above about **70,000/day**; the archive going dark costs more than $5.
Until then, treat the free-tier quotas as engineering limits.

## Purging the cache after an API change

`/api/*` responses sit in Cloudflare's shared cache with `s-maxage=86400`, so a
changed payload can stay stale for up to a day. Content edits through
`/contribute` have the same delay.

They also send `max-age=0, must-revalidate`. A browser may keep a copy but must
check with the edge before using it, so once you purge, every visitor gets the
new payload on their next request. See
[architecture.md](./architecture.md#why-some-pages-fetch-their-own-data).

After deploying any change to what an `/api/*` endpoint returns (a new shape, or
different values in the same shape):

1. Cloudflare dashboard → the `phoxiv.org` zone → **Caching → Configuration**.
2. **Purge Everything**, or purge these URLs:
   - `https://phoxiv.org/api/olympiads`
   - `https://phoxiv.org/api/olympiads/<id>` (one per olympiad)
   - `https://phoxiv.org/api/search`
   - `https://phoxiv.org/api/stats`
3. Reload the site and check the new payload is served.

**`/api/search/files` can only be cleared with Purge Everything.** Its responses
are keyed by query string, so there is no list of URLs to purge. This applies to
any change in what it answers, not just its shape. For example, changing how a
query becomes a `MATCH` expression leaves the shape alone but makes every cached
answer stale. Skip the purge and a fix that works locally looks like it never
deployed.

The public shapes are `OlympiadEntry[]`, `YearEntry[]`, `SearchItem[]`,
`FileSearchResponse` and the stats triple. Before changing one, consider a newly
deployed client reading a day-old cached body.

Purging also publishes content edits early. For example, a new `maxScore` shows
in the year editor at once but on the olympiad page only after the cache turns
over; purge `https://phoxiv.org/api/olympiads/<id>` to speed it up.

`/api/auth/[...all]` sets no cache headers and must never be given any.
