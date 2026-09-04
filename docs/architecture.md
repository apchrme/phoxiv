# Architecture

phoXiv is a SvelteKit app deployed as a single Cloudflare Worker. Metadata lives
in **D1** (SQLite), the olympiad files themselves live in **R2** and are served
from `cdn.phoxiv.org`. There is no separate backend: every read is a Drizzle
query against D1 from inside the Worker.

## Request lifecycle

Everything starts in [`src/hooks.server.ts`](../src/hooks.server.ts), which
builds the per-request context:

```
request
  → hooks.server.ts
      platform.env.DB   ──drizzle()──────────→ locals.db
      platform.env      ──createAuth(db, env)→ locals.auth
      locals.auth.api.getSession(headers)    → locals.user, locals.session
  → +layout.server.ts / +page.server.ts / +server.ts
  → response
```

Two things are worth understanding about that.

**Neither the database handle nor the auth instance can be a module-level
singleton.** Both are derived from `platform.env`, which only exists inside a
Worker request. That is why `createAuth` is a function rather than a constant —
see [auth.md](./auth.md).

**The session is resolved once, in the hook.** Loads, actions and endpoints read
`locals.user` synchronously instead of each awaiting their own `getSession`
round-trip. `App.Locals` is declared in [`src/app.d.ts`](../src/app.d.ts):

| Field            | What it is                                |
| ---------------- | ----------------------------------------- |
| `locals.db`      | `DrizzleD1Database` over the `DB` binding |
| `locals.auth`    | the per-request BetterAuth instance       |
| `locals.user`    | the signed-in user, or `null`             |
| `locals.session` | the session record, or `null`             |

> `DB` is the _wrangler binding name_ declared in `wrangler.jsonc`. Application
> code never touches it directly — it reads `locals.db`.

## Why the route tree is shaped as it is

The shape of `src/routes/` is driven almost entirely by **caching**. There are
two policies, both defined in [`$lib/server/cache.ts`](../src/lib/server/cache.ts):

| Policy              | Header                                       | Where                   |
| ------------------- | -------------------------------------------- | ----------------------- |
| `setPrivateCache()` | `max-age=14400, must-revalidate, private`    | pages under `(reg)`     |
| `setSharedCache()`  | `max-age=0, s-maxage=86400, must-revalidate` | `/api/*` data endpoints |

Two routes set their own third policy: `/olympiads/[olympiad]/progress` and
`/progress` both answer `private, no-store`, because each carries one user's
answers. See [below](#why-some-pages-fetch-their-own-data).

`(reg)` is a route _group_ — it adds nothing to the URL. Its only member is
[`(reg)/+layout.server.ts`](<../src/routes/(reg)/+layout.server.ts>), which calls
`setPrivateCache()`. **That is the entire reason the group exists.** Pages in it
are cached for four hours in the visitor's own browser; `private` keeps them out
of any shared cache, because a page can embed the signed-in user's name and
avatar.

`/api/*` goes the other way. `max-age=0` plus `must-revalidate` lets a browser
store a copy but never reuse one without revalidating, so a "Purge cache" in the
Cloudflare dashboard reaches every visitor on their next request;
`s-maxage=86400` means Cloudflare's shared cache hits D1 at most once a day.
The trade is that **a wrong payload persists for up to a day and needs a manual
purge** — see [deployment.md](./deployment.md).

Two things about that shared cache are worth knowing before reasoning about load,
because both are counter-intuitive and will otherwise be rediscovered:

- **Tiered Cache is already on** at the zone, with Smart topology, and on the
  Free plan it is not editable — so the per-PoP fill multiplier is already
  collapsed as far as it goes. There is no lever there to pull.
- **`s-maxage=86400` is an upper bound, not a description.** At this traffic
  level fills are driven by **LRU eviction, not TTL expiry**: `/api/stats` was
  measured filling ~30 times a day and `/api/olympiads/[olympiad]` ~350 times a
  day across 33 keys, because a low-traffic site's rarely-requested objects get
  evicted from a busy PoP long before a day passes. **Raising `s-maxage` therefore
  buys much less than the arithmetic suggests.** If an endpoint's D1 cost
  matters, make the query cheap rather than trying to cache it harder — which is
  exactly what happened to deep search in [search.md](./search.md).

Below the shared cache there is one more layer that is easy to miss:
`adapter-cloudflare`'s own `files/worker.js` wraps the Worker in
`caches.default`, so a hit is returned **before `hooks.server.ts` runs**. It is
data-center-local and does not participate in Tiered Cache, and adding a second
Cache API layer of our own would be redundant. It is also visible under
`bun run preview`, where miniflare persists it in `.wrangler/state/v3/cache` —
worth clearing when a preview seems to be serving a stale body.

Four things sit outside `(reg)` on purpose:

- **`/`** — the landing page could have lived inside the group; it sits at the
  route root instead and applies the same header itself, in
  [`+page.server.ts`](../src/routes/+page.server.ts).
- **`/admin`** — must never be cached at all, so it sets no header. SvelteKit
  emits no `cache-control` of its own for a server-rendered page and Cloudflare
  does not cache HTML by default, so "no header" really does mean "not cached".
- **`/contribute`** — same reasoning: it renders unsaved editor state.
- **`/progress`** — the ⌘K dialog's cross-olympiad progress endpoint. It sets
  `private, no-store` itself, and it is outside the group because a `+server.ts`
  never receives a layout's header anyway; sitting beside `admin/` and
  `contribute/` is what makes "deliberately uncached" legible at a glance.

And within `/api`, **`/api/auth/[...all]` sets no cache headers**, which it must
not: it carries `Set-Cookie` and session state.

## Route map

```
src/routes/
├── +layout.svelte              shell: sidebar, nav, GlobalSearch, toaster
├── +layout.server.ts           exposes locals.user to every page
├── +layout.ts                  legacy 308 redirects (see below), passes data through
├── +error.svelte
├── AppSidebar.svelte           mobile navigation
├── +page.svelte / .server.ts   landing page (fetches /api/stats client-side)
│
├── (reg)/                      ← private browser cache, nothing else
│   ├── olympiads/              index; [olympiad]/ detail + YearPanel/ProblemCard/
│   │                           ProgressControl/SignInToTrack/filter,
│   │                           and [olympiad]/progress/, an endpoint that answers
│   │                           private, no-store
│   ├── blog/                   index and [slug]/, from $lib/posts/*.svx
│   ├── resources/              .svx page
│   ├── privacy/                .svx page
│   ├── login/                  redirects to /profile if already signed in
│   └── profile/                redirects to /login if not
│
├── admin/                      ← deliberately outside (reg); requireAdmin in +layout.server.ts
│   ├── columns.ts              TanStack column model
│   ├── reindex/                the backfill's two halves; calls requireAdmin ITSELF,
│   │                           because a +server.ts runs no layout loads
│   └── UsersTable.svelte, UserRowActions.svelte, ActivityLogTable.svelte,
│       IndexPanel.svelte
│
├── progress/                   ← outside (reg); one GlobalProgressMap for the ⌘K
│                               dialog, private, no-store
│
├── contribute/                 ← outside (reg); requireContributor in +layout.server.ts
│   ├── SelectYearForm.svelte, NewOlympiadForm.svelte
│   └── [olympiad]/             olympiad metadata editor (4 colocated components)
│       ├── titles.csv/         CSV export endpoint
│       └── [year]/             year editor (metadata.ts + 6 colocated components)
│
└── api/                        ← Cloudflare shared cache…
    ├── olympiads/              OlympiadEntry[]
    ├── olympiads/[olympiad]/   YearEntry[]
    ├── search/                 SearchItem[] — the whole corpus, matched in the browser
    ├── search/files/           FileSearchResponse — deep search, matched in D1 by FTS5
    ├── stats/                  the three landing-page counters
    └── auth/[...all]/          …except this one, which sets no cache headers
```

[`+layout.ts`](../src/routes/+layout.ts) holds the legacy URL redirects: olympiad
ids that used to live at the site root (`/ipho/…` → `/olympiads/ipho/…`),
`/contests/…` → `/olympiads/…`, and document extensions that used to be served
from `/static` and now redirect to the CDN. It also passes the server layout's
data straight through, which is **not** optional: when a universal `+layout.ts`
exists, SvelteKit derives `LayoutData` from _its_ return type, so returning
nothing would drop `user` from every page's `data`.

### Why some pages fetch their own data

The olympiads index, the olympiad detail page and the landing page all `fetch()`
from `/api/*` on mount instead of using a server `load`. This is deliberate: a
server load would cost a D1 read per visit, while the `fetch` is answered by
Cloudflare's shared cache.

Be precise about how stale that can get. `max-age=0` does not keep a browser from
holding its own copy — that directive governs reuse, not storage — but
`must-revalidate` forbids reusing a held copy without a successful revalidation,
so every load asks the edge. The staleness that remains is Cloudflare's own copy:
up to 24 hours, identical for a first-time visitor and a returning one, and
cleared for both by a purge. A contributor's edit therefore appears when the edge
refreshes rather than on someone's _second_ load. This is accepted rather than
overlooked: the archive changes rarely, and a payload that is a little behind
renders as incomplete, never as wrong.

The public response shapes are near-frozen for a related reason — a changed
shape lives in the cache for a day, and only a manual dashboard purge clears it
early. `YearEntry[]` has been changed once deliberately, to carry each problem's
`maxScore`, and `SearchItem[]` once, to carry each problem's `topics`;
[deployment.md](./deployment.md#purging-the-cache-after-an-api-change) holds the
procedure and the cost of skipping it.

**`/olympiads/[olympiad]/progress` is a `fetch` for the opposite reason.** It
serves the signed-in user's tracked problems and nothing else, and two things
follow from that:

- It sits **outside `/api/`** so that nobody reflexively adds `setSharedCache()`
  to it, which would serve one user's answers to every visitor. The header it
  sets instead is the second line of defence, not the first.
- It is **not a page load**. `(reg)/+layout.server.ts` has already set the
  four-hour private cache header and SvelteKit refuses to set the same header
  twice, so a page load could not downgrade itself to `no-store` — and four
  hours of privately cached `__data.json` would serve stale progress. A
  `+server.ts` runs no layout loads, so neither that header nor `+layout.ts`'s
  legacy redirects apply to it.

It carries **only** what differs per user. A problem's `maxScore` is the same
for every visitor, so it sits on `ProblemEntry` in the shared payload instead —
and what comes back here is one key per tracked problem, with no `completed`
flag, because the key's existence is the flag.

The tracking action itself, `?/trackProblem`, resolves `problems.id` server-side
from `(olympiad, year, number)`. That is what lets the page stay ignorant of
problem ids — so no row id ever has to enter a cached payload — and what lets a
progress entry be keyed on `(year, number)` at all.

**`/progress` is the same endpoint one scope wider.** The ⌘K dialog's status
filter spans the archive, so it cannot use the per-olympiad route, and it answers
a `GlobalProgressMap` — a `ProgressMap` per olympiad id. The nesting is
load-bearing rather than tidy: `progressKey` is `(year, number)` only, so
flattening the archive onto those keys would file IPhO 2019 T1 and APhO 2019 T1
under one key and mark the wrong problems done, silently. It reads **nothing**
from the URL — its only input is `locals.user.id` — so there is no id to confuse,
and a future `?user=` would be wrong on its face. It sits at the route root
rather than at `/olympiads/progress`, where a static segment would win over
`olympiads/[olympiad]` and permanently shadow an olympiad whose id happened to be
`progress`.

Two things are built on top of that map, both entirely in the browser:

- **The progress filter** — `StatusFilter.svelte`'s icon-only `All problems /
Done / To do` dropdown — is a client-side filter over the map the page
  already holds; see `filter.ts`, where it joins the topic filter in
  `visibleProblems`. No new endpoint, no new field, and nothing new on the wire.
  It is rendered only for signed-in users, since "Done" could only ever be empty
  without a session. The component lives in `$lib/components/` beside
  `TopicSelect.svelte` and is **shared with the ⌘K dialog**, which offers the same
  two filters over the whole archive: a `$lib` component cannot import from a
  route directory, and the predicates behind both — `$lib/filters.ts` — are shared
  for the same reason, so the two screens cannot disagree about what "Done" means.
  See [search.md](./search.md#the-filters-and-why-they-vanish).
- **The tracking affordance itself is rendered for everyone.** A signed-out
  visitor gets `SignInToTrack.svelte` in the same corner of the same card — the
  same circle, dimmed and inert, explaining on hover, focus or tap that tracking
  needs an account. The permission is still enforced server-side by
  `?/trackProblem`'s `locals.user` check; the disabled circle is discoverability,
  not a guard.

## The `$lib/server/` module map

Server-only code. SvelteKit refuses to bundle anything under `$lib/server/` into
the client, so this boundary is enforced by the build, not by convention.

| Module            | Responsibility                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `auth.ts`         | the BetterAuth configuration, as a function of `(database, env)`                                         |
| `auth-cli.ts`     | a module-level instance for the schema generator only — never imported by app code                       |
| `guard.ts`        | `requireAdmin` / `requireContributor` / `requireOlympiadEditor`, each returning `{ db, user }`           |
| `cache.ts`        | the two cache policies described above                                                                   |
| `forms.ts`        | form-field parsing and the action-result envelope                                                        |
| `uploads.ts`      | server-side enforcement of the upload rules declared in `$lib/uploads.ts`                                |
| `storage.ts`      | every R2 read and write, and the object-key layout                                                       |
| `markdown.ts`     | the _only_ place Markdown is rendered and sanitised                                                      |
| `activity-log.ts` | `logActivity`, writing the admin panel's audit trail                                                     |
| `reindex-cli.ts`  | the backfill driver, run by `bun run index:backfill` — never imported by app code                        |
| `db/index.ts`     | re-exports the schema and aliases the `DB` handle type                                                   |
| `db/schema.ts`    | the Drizzle schema — the source drizzle-kit generates migrations from                                    |
| `db/relations.ts` | Drizzle's relational definitions, kept separate from the table declarations                              |
| `db/queries/`     | `olympiads.ts`, `years.ts`, `content.ts`, `progress.ts`, `files.ts`: every query, one module per concern |

What each query module is for, since the names only half say it:

| Module         | Reads / writes                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `olympiads.ts` | the olympiad list and one olympiad's metadata; the create/edit/delete writes                                                               |
| `years.ts`     | years within an olympiad, and the year-level notes, links and files                                                                        |
| `content.ts`   | the joined reads that assemble years, problems and their files — the frozen public shapes and the year editor. `getSearchIndex` lives here |
| `progress.ts`  | one user's tracked problems, per olympiad and across the archive                                                                           |
| `files.ts`     | the full-text index: sanitising a query, reading it, writing it, keeping it tidy                                                           |

Client-safe modules sit directly under `$lib/`: `types.ts`, `uploads.ts`,
`constants.ts`, `nav.ts`, `posts.ts`, `activity.ts`, `progress.ts`, `filters.ts`,
`search.ts`, `pdf-text.ts`, `forms.svelte.ts`, `auth-client.ts`, `utils.ts` (just
`cn`), `utils/{date,flag,fuzzy,json,topics}.ts`, `hooks/is-mobile.svelte.ts` and
`prose.svelte`.
Several of them exist specifically so a rule is stated once and consumed from
both sides — the upload allow-list is the clearest example, `progress.ts` carries
the score rules the year editor, the CSV import, the `trackProblem` action and
the problem cards all go through, and `filters.ts` is the newest: it holds the
topic and progress predicates that the olympiad page's toolbar and the ⌘K dialog
both apply, which is what stops the two screens disagreeing about what "Done" or
"Relativity" selects.

## The colocation convention

**A component used by exactly one route lives next to that route**, flat, with
no `+` prefix and no subfolder. Only genuinely route-agnostic pieces go in
`$lib/components/`.

SvelteKit only treats `+`-prefixed files as route files, so a plain
`YearPanel.svelte` beside a `+page.svelte` is inert as far as routing is
concerned. The reason it has to be _there_ rather than in `$lib` is types: these
components import `PageData` / `ActionData` from `./$types`, and that specifier
is resolved through the `rootDirs` mapping that `.svelte-kit/tsconfig.json` sets
up for route directories only. The same file under `$lib` cannot resolve it.

Child components import `PageData` / `ActionData`, **not** `PageProps` — that
bundle belongs to the page.

[`(reg)/olympiads/[olympiad]/`](<../src/routes/(reg)/olympiads/[olympiad]>) is
the reference for the style: a `+page.svelte` that owns state and data fetching,
presentational children beside it, and the fiddly pure logic in a plain `.ts`
module.

## The action-result envelope

Every form action in the app resolves to exactly one of two shapes:

```ts
{ action: 'uploadFile', success: true }                   // plus any payload
{ action: 'uploadFile', success: false, error: '…' }
```

built by `ok()` and `actionFail()` in
[`$lib/server/forms.ts`](../src/lib/server/forms.ts). Because `success` is a
literal `true` / `false`, the `form` union SvelteKit generates in `./$types` is a
discriminated union — first on `success`, then on `action`. A page can write
`if (!form.success) …` and narrow payload fields by checking `form.action`, with
no `'x' in form` probing.

[`$lib/forms.svelte.ts`](../src/lib/forms.svelte.ts) is the client half of that
contract, and the two files change together:

- **`formToasts(() => form, { … })`** — call **once**, on the component that owns
  `form`. Failures toast `form.error`; successes look `form.action` up in the map.
- **`Pending`** — tracks in-flight submissions so buttons can disable themselves.
  `track()` is a drop-in `use:enhance` value. `has()` must read the same map
  `track()` wrote, so a page with several forms uses **one** instance passed down
  as a plain prop; per-component instances leave every button permanently enabled.

Actions that end in `redirect()` never return, and so never appear in the union.

## Work the Worker deliberately does not do

Two jobs that would naturally sit in the Worker are pushed out of it, and both
are worth knowing as architecture rather than as feature detail.

**The Worker never parses a PDF.** Text extraction for deep search runs in the
contributor's browser, and the one-time backfill runs in a local `bun` script.
The reason is measured, not aesthetic: the whole server bundle is about 0.43 MB
gzipped and pdf.js is roughly +0.5 MB, so a Worker-side parser would be **larger
than the entire application** and would be charged to cold-start parse time on
_every_ route, to serve a path that runs a few times a month. It would fit inside
the 10 MB limit; it is simply disproportionate. The vendored build in
`static/vendor/pdfjs/` is therefore a static asset served by `ASSETS`, reached
through a **runtime string URL** so neither Vite nor Rollup can pull it into the
server bundle — guarded by the one-command bundle check in
[deployment.md](./deployment.md#the-bundle-check).

**The Worker never matches a problem search.** `/api/search` ships the whole
corpus once per session and the ⌘K dialog matches it in the browser, so typing
costs no D1 read at all. Only deep search queries the server, once per settled
query, and its endpoint takes **one parameter** — every accepted parameter
multiplies cache keys, and it reads no cookie and never touches `locals.user`,
which is what makes its body safe in the shared cache.

Both pipelines, the two search modes and everything between an uploaded PDF and a
highlighted snippet are documented end to end in [search.md](./search.md).
