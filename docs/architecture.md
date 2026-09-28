# Architecture

phoXiv is a SvelteKit app on a single Cloudflare Worker. Metadata lives in D1
(SQLite); olympiad files live in R2, served from `cdn.phoxiv.org`. There is no
separate backend.

## Request lifecycle

[`src/hooks.server.ts`](../src/hooks.server.ts) builds the per-request context,
typed in [`src/app.d.ts`](../src/app.d.ts):

```
request
  → hooks.server.ts
      platform.env.DB   ──drizzle()──────────→ locals.db
      platform.env      ──createAuth(db, env)→ locals.auth
      locals.auth.api.getSession(headers)    → locals.user, locals.session  (or null)
  → +layout.server.ts / +page.server.ts / +server.ts
```

- `db` and `auth` cannot be module-level singletons. Both need `platform.env`,
  which exists only inside a request. See [auth.md](./auth.md#why-createauth-is-a-function).
- The session is resolved once, in the hook. Routes read `locals.user`; don't
  call `getSession` again.
- App code reads `locals.db`, never the `DB` binding.

## Caching and the route tree

The route tree is shaped by two cache policies, in
[`$lib/server/cache.ts`](../src/lib/server/cache.ts):

| Policy              | Header                                       | Used by             |
| ------------------- | -------------------------------------------- | ------------------- |
| `setPrivateCache()` | `max-age=14400, must-revalidate, private`    | pages under `(reg)` |
| `setSharedCache()`  | `max-age=0, s-maxage=86400, must-revalidate` | `/api/*` endpoints  |

- **Private.** `(reg)` is a route group that exists only so
  [`(reg)/+layout.server.ts`](<../src/routes/(reg)/+layout.server.ts>) can call
  `setPrivateCache()`. Pages are cached for four hours in the visitor's browser;
  `private` keeps them out of shared caches because a page can show the
  signed-in user.
- **Shared.** Cloudflare keeps the body for up to a day, so D1 is hit at most
  once a day per key. The browser must revalidate on every use, so a dashboard
  purge reaches everyone on their next request. A wrong payload persists until
  purged — see [deployment.md](./deployment.md).

About the shared cache:

- Tiered Cache is already on and cannot be changed on the Free plan.
- At this traffic level objects are evicted (LRU) long before `s-maxage`
  expires, so raising it buys little. To cut an endpoint's D1 cost, make the
  query cheaper.
- `adapter-cloudflare`'s worker wraps the app in `caches.default`, so a hit
  returns before `hooks.server.ts` runs. Don't add a second Cache API layer.
  Under `bun run preview` it persists in `.wrangler/state/v3/cache`; clear that
  if a preview serves a stale body.

### Routes outside `(reg)`

- `/` sets the private header itself in [`+page.server.ts`](../src/routes/+page.server.ts).
- `/admin` and `/contribute` must never be cached, so they set no header.
  SvelteKit sends no `cache-control` for a server-rendered page and Cloudflare
  does not cache HTML by default.
- The admin endpoints `reindex/`, `index-stats/` and `activity/` also set no
  headers. They are not under `/api/` because every handler there is shared-cached.
- `/progress` is per-user and sets `private, no-store` itself. See
  [per-user progress](#per-user-progress).

`/olympiads/[olympiad]/progress` is inside `(reg)` but is a `+server.ts`, so it
gets no layout header and sets `private, no-store` itself. `/api/auth/[...all]`
sets no cache headers, and must not: it carries `Set-Cookie` and session state.

## Route map

```
src/routes/
├── +layout.svelte              shell: sidebar, nav, footer, GlobalSearch, toaster
├── +layout.server.ts           exposes locals.user to every page
├── +layout.ts                  legacy 308 redirects; passes data through
├── +error.svelte, AppSidebar.svelte
├── +page.svelte / .server.ts   landing page; fetches /api/stats and /api/olympiads
├── CorpusBand, CorpusTile, StatsBand, FeatureBlocks (.svelte), corpus.ts   landing-page parts
│
├── (reg)/                      private browser cache
│   ├── olympiads/              index, and [olympiad]/ with YearPanel, ProblemCard,
│   │                           ProgressControl, SignInToTrack, filter.ts,
│   │                           and progress/ (endpoint, private, no-store)
│   ├── blog/                   index and [slug]/, from $lib/posts/*.svx
│   ├── resources/, privacy/    .svx pages
│   ├── login/                  redirects to /profile if signed in
│   └── profile/                redirects to /login if not
│
├── admin/                      requireAdmin in +layout.server.ts; never cached
│   ├── reindex/, index-stats/, activity/   endpoints; each calls requireAdmin itself
│   └── columns.ts, UsersTable, UserRowActions, ActivityLogTable, IndexPanel
│
├── progress/                   GlobalProgressMap for the ⌘K dialog; private, no-store
│
├── contribute/                 requireContributor in +layout.server.ts; never cached
│   ├── SelectYearForm.svelte, NewOlympiadForm.svelte
│   └── [olympiad]/             olympiad editor (4 colocated components)
│       ├── titles.csv/         CSV export endpoint
│       └── [year]/             year editor (metadata.ts + 6 colocated components)
│
└── api/                        shared cache
    ├── olympiads/              OlympiadEntry[]
    ├── olympiads/[olympiad]/   YearEntry[]
    ├── search/                 SearchItem[]: the whole corpus, matched in the browser
    ├── search/files/           FileSearchResponse: deep search, matched in D1 by FTS5
    ├── stats/                  landing-page counters
    └── auth/[...all]/          the exception: no cache headers
```

[`+layout.ts`](../src/routes/+layout.ts) redirects legacy URLs (`/ipho/…`,
`/contests/…`, and document extensions, which go to the CDN). It must return the
server layout's `data`: SvelteKit derives `LayoutData` from a universal
`+layout.ts`'s return type, so returning nothing drops `user` from every page.

### The two mdsvex layouts

`resources/+page.svx`, `privacy/+page.svx` and the posts in `$lib/posts/` are
markdown. mdsvex wraps each in a layout and passes front matter as props.
[`svelte.config.js`](../svelte.config.js) maps layouts by name: mdsvex picks the
key matching a folder in the file's path, else `_`.

- [`prose.svelte`](../src/lib/prose.svelte) (`_`) is the whole page: a
  `PageHeader` and `SvelteSeo` from front matter, plus the prose wrapper.
- [`post.svelte`](../src/lib/post.svelte) (`posts`) is only the prose wrapper.
  [`blog/[slug]/+page.svelte`](<../src/routes/(reg)/blog/[slug]/+page.svelte>)
  draws the header and `SvelteSeo`. On `_`, a post would print its title twice
  and emit two `<title>` tags.

## Why some pages fetch their own data

The landing page, the olympiads index and the olympiad page `fetch()` from
`/api/*` in the browser instead of using a server `load`. A load costs a D1 read
per visit; the fetch is answered by the shared cache. The data can be up to a day
old, which is fine for an archive that changes rarely. Changing an `/api/*`
response shape needs a purge — see
[deployment.md](./deployment.md#purging-the-cache-after-an-api-change).

### Per-user progress

`/olympiads/[olympiad]/progress` returns the user's tracked problems in one
olympiad as a `ProgressMap`: one key per tracked problem, nothing else.

- It is outside `/api/` so nobody adds `setSharedCache()`, which would serve one
  user's answers to everyone. `no-store` is the second line of defence.
- It is a `fetch`, not a page load. `(reg)`'s layout already sets the four-hour
  header and SvelteKit won't set a header twice, so a load could not switch to
  `no-store`. A `+server.ts` runs no layout loads.
- `maxScore` is the same for everyone, so it lives on `ProblemEntry` in the
  shared payload, not here.

`?/trackProblem` resolves `problems.id` on the server from
`(olympiad, year, number)`, so no row id enters a cached payload.

`/progress` does the same for the whole archive, for the ⌘K dialog. It returns a
`GlobalProgressMap`: one `ProgressMap` per olympiad id.

- Keep the nesting. `progressKey` is `(year, number)`, so a flat map would merge
  IPhO 2019 T1 with APhO 2019 T1 and mark the wrong problems done.
- Its only input is `locals.user.id`. Don't add a `?user=` parameter.
- It lives at the root because `/olympiads/progress` would shadow an olympiad
  whose id is `progress`.

`StatusFilter.svelte` (All / Done / To do) filters these maps in the browser and
shows only when signed in. The olympiad page and the ⌘K dialog share it and
`$lib/filters.ts`, so they agree on what "Done" means — see
[search.md](./search.md#the-filters-and-why-they-vanish). Signed-out visitors see
`SignInToTrack.svelte`, a dimmed circle with a hint; it is not a guard.

## The module map

Everything in `src/lib/` outside `components/`.

### `$lib/server/`

Server-only; SvelteKit refuses to bundle it into the client.

| Module            | Responsibility                                                                       |
| ----------------- | ------------------------------------------------------------------------------------ |
| `auth.ts`         | BetterAuth configuration, as a function of `(database, env)`                         |
| `auth-cli.ts`     | static auth instance for the schema generator                                        |
| `guard.ts`        | `requireAdmin`, `requireContributor`, `requireOlympiadEditor`, permission predicates |
| `cache.ts`        | the two cache policies                                                               |
| `forms.ts`        | form-field parsing and the action-result envelope                                    |
| `uploads.ts`      | server-side enforcement of `$lib/uploads.ts`                                         |
| `storage.ts`      | every R2 read and write, and the object-key layout                                   |
| `markdown.ts`     | the only place Markdown is rendered and sanitised                                    |
| `activity-log.ts` | the audit trail: `logActivity` writes, `listActivity` reads by keyset                |
| `reindex-cli.ts`  | text-index backfill (`bun run index:backfill`)                                       |
| `thumbs-cli.ts`   | landing-page thumbnail renderer (`bun run thumbs:render`)                            |
| `db/index.ts`     | re-exports the schema; aliases the `DB` handle type                                  |
| `db/schema.ts`    | the Drizzle schema, source of generated migrations                                   |
| `db/relations.ts` | Drizzle relational definitions                                                       |
| `db/queries/`     | every query, by concern (below)                                                      |

The three `-cli` modules are never imported by app code. They live here, not in
a top-level `scripts/`, so `bun run check` covers them. `activity-log.ts` stays
out of `db/queries/` because the action enum and its never-fail-a-write policy
live with it.

| Query module   | Reads / writes                                                               |
| -------------- | ---------------------------------------------------------------------------- |
| `olympiads.ts` | the olympiad list and metadata; create, edit, delete                         |
| `years.ts`     | years, and year-level notes, links and files                                 |
| `content.ts`   | joined reads for the public API shapes and the year editor; `getSearchIndex` |
| `progress.ts`  | a user's tracked problems, per olympiad and archive-wide                     |
| `files.ts`     | the full-text index: query sanitising, reads, writes, upkeep                 |

### Client-safe `$lib/`

| Module                        | Responsibility                                                             |
| ----------------------------- | -------------------------------------------------------------------------- |
| `types.ts`                    | shared types and enums, including the public API shapes                    |
| `uploads.ts`                  | the upload allow-list, `slugifyLabel`, `collidingLabel`                    |
| `constants.ts`                | constants both sides need, including `CDN_BASE_URL`                        |
| `nav.ts`                      | navigation links and `secondaryNavFor(user)`                               |
| `posts.ts`                    | loads blog posts from `$lib/posts/*.svx`                                   |
| `activity.ts`                 | display labels for activity-log entries                                    |
| `progress.ts`                 | score rules for the editor, CSV import, `trackProblem` and problem cards   |
| `filters.ts`                  | topic and progress predicates for the olympiad page and ⌘K dialog          |
| `search.ts`                   | deep-search normalisation for the dialog, the endpoint and text extraction |
| `pdf-text.ts`                 | browser-side PDF text extraction                                           |
| `forms.svelte.ts`             | `formToasts` and `Pending`                                                 |
| `resource.svelte.ts`          | `Resource`: fetches a JSON endpoint, tracking value, loading and failure   |
| `auth-client.ts`              | the BetterAuth browser client                                              |
| `utils.ts`                    | `cn` only                                                                  |
| `utils/`                      | `date`, `flag`, `fuzzy`, `json`, `plural`, `topics`                        |
| `hooks/is-mobile.svelte.ts`   | `IsMobile`, a viewport media query                                         |
| `prose.svelte`, `post.svelte` | the two mdsvex layouts                                                     |

`uploads.ts`, `progress.ts`, `filters.ts` and `search.ts` are client-safe so the
browser and the server apply the same rule.

## The colocation convention

A component used by one route lives next to it: flat, no `+` prefix, no
subfolder. Only route-agnostic pieces go in `$lib/components/`.

Non-`+` files are inert to the router. The component must live beside the route
because it imports `PageData` / `ActionData` from `./$types`, which resolves only
in route directories. Children import those, not `PageProps`, which belongs to
the page.

[`(reg)/olympiads/[olympiad]/`](<../src/routes/(reg)/olympiads/[olympiad]>) is
the reference: `+page.svelte` owns state and fetching, presentational children
sit beside it, and pure logic goes in a plain `.ts` file. Check the shared
primitives before writing a new component — see
[contributing.md](./contributing.md#reach-for-the-shared-primitives-before-writing-markup).

## The action-result envelope

Every form action returns one of two shapes, built by `ok()` and `actionFail()`
in [`$lib/server/forms.ts`](../src/lib/server/forms.ts):

```ts
{ action: 'uploadFile', success: true }                   // plus any payload
{ action: 'uploadFile', success: false, error: '…' }
```

`success` is a literal, so `form` is a discriminated union on `success`, then
`action`. Write `if (!form.success)` and narrow by `form.action`. Actions that end
in `redirect()` are not in the union.

[`$lib/forms.svelte.ts`](../src/lib/forms.svelte.ts) is the client half; change
both files together.

- `formToasts(() => form, { … })`: call once, on the component that owns `form`.
  Failures toast `form.error`; successes look up `form.action`.
- `Pending`: tracks in-flight submissions. `track()` is a drop-in `use:enhance`
  value. `has()` must read the map `track()` wrote, so a page creates one
  instance and passes it down. Separate instances leave every button enabled.

## What the Worker does not do

- **It never parses a PDF.** Text extraction runs in the contributor's browser,
  and the backfill in a local `bun` script. pdf.js is about 0.5 MB gzipped, more
  than the whole 0.43 MB server bundle, and every route would pay for it at cold
  start. The vendored `static/vendor/pdfjs/` is loaded by a runtime string URL so
  the bundler can't pull it in; the
  [bundle check](./deployment.md#the-bundle-check) guards this.
- **It never matches a problem search.** `/api/search` ships the whole corpus
  once and the ⌘K dialog matches in the browser. Deep search takes one parameter
  (each extra one multiplies cache keys) and never reads a cookie, which makes it
  safe to share-cache.

Details for both are in [search.md](./search.md).
