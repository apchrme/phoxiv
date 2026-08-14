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

| Policy              | Header                                                     | Where                   |
| ------------------- | ---------------------------------------------------------- | ----------------------- |
| `setPrivateCache()` | `max-age=14400, must-revalidate, private`                  | pages under `(reg)`     |
| `setSharedCache()`  | `max-age=0, s-maxage=86400, stale-while-revalidate=604800` | `/api/*` data endpoints |

`(reg)` is a route _group_ — it adds nothing to the URL. Its only member is
[`(reg)/+layout.server.ts`](<../src/routes/(reg)/+layout.server.ts>), which calls
`setPrivateCache()`. **That is the entire reason the group exists.** Pages in it
are cached for four hours in the visitor's own browser; `private` keeps them out
of any shared cache, because a page can embed the signed-in user's name and
avatar.

`/api/*` goes the other way. `max-age=0` stops browsers holding a private copy,
so a "Purge cache" in the Cloudflare dashboard reaches every visitor at once;
`s-maxage=86400` means Cloudflare's shared cache hits D1 at most once a day.
The trade is that **a wrong payload persists for up to a day and needs a manual
purge** — see [deployment.md](./deployment.md).

Three things sit outside `(reg)` on purpose:

- **`/`** — the landing page could have lived inside the group; it sits at the
  route root instead and applies the same header itself, in
  [`+page.server.ts`](../src/routes/+page.server.ts).
- **`/admin`** — must never be cached at all, so it sets no header. SvelteKit
  emits no `cache-control` of its own for a server-rendered page and Cloudflare
  does not cache HTML by default, so "no header" really does mean "not cached".
- **`/contribute`** — same reasoning: it renders unsaved editor state.

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
│   ├── olympiads/              index; [olympiad]/ detail + YearPanel/ProblemCard/filter
│   ├── blog/                   index and [slug]/, from $lib/posts/*.svx
│   ├── resources/              .svx page
│   ├── privacy/                .svx page
│   ├── login/                  redirects to /profile if already signed in
│   └── profile/                redirects to /login if not
│
├── admin/                      ← deliberately outside (reg); requireAdmin in +layout.server.ts
│   ├── columns.ts              TanStack column model
│   └── UsersTable.svelte, UserRowActions.svelte, ActivityLogTable.svelte
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
Cloudflare's shared cache. The four public response shapes are effectively
frozen for that reason — a changed shape lives in the cache for a day.

## The `$lib/server/` module map

Server-only code. SvelteKit refuses to bundle anything under `$lib/server/` into
the client, so this boundary is enforced by the build, not by convention.

| Module            | Responsibility                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| `auth.ts`         | the BetterAuth configuration, as a function of `(database, env)`                               |
| `auth-cli.ts`     | a module-level instance for the schema generator only — never imported by app code             |
| `guard.ts`        | `requireAdmin` / `requireContributor` / `requireOlympiadEditor`, each returning `{ db, user }` |
| `cache.ts`        | the two cache policies described above                                                         |
| `forms.ts`        | form-field parsing and the action-result envelope                                              |
| `uploads.ts`      | server-side enforcement of the upload rules declared in `$lib/uploads.ts`                      |
| `storage.ts`      | every R2 read and write, and the object-key layout                                             |
| `markdown.ts`     | the _only_ place Markdown is rendered and sanitised                                            |
| `activity-log.ts` | `logActivity`, writing the admin panel's audit trail                                           |
| `db/index.ts`     | re-exports the schema and aliases the `DB` handle type                                         |
| `db/schema.ts`    | the Drizzle schema — the source drizzle-kit generates migrations from                          |
| `db/queries/`     | `olympiads.ts`, `years.ts`, `content.ts`: every query, one module per concern                  |

Client-safe modules sit directly under `$lib/`: `types.ts`, `uploads.ts`,
`constants.ts`, `nav.ts`, `posts.ts`, `activity.ts`, `forms.svelte.ts`,
`auth-client.ts` and `utils/{date,flag,fuzzy,json,topics}.ts`. Several of them
exist specifically so a rule is stated once and consumed from both sides — the
upload allow-list is the clearest example.

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
