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

The four public shapes are near-frozen for this reason — `OlympiadEntry[]`,
`YearEntry[]`, `SearchItem[]` and the stats triple. A newly deployed client
paired with a day-old cached payload is the failure mode to think about before
changing one.

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
