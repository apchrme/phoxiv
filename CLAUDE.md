# phoXiv

An archive of high-school physics olympiad problems. SvelteKit on a single
Cloudflare Worker, with metadata in D1 and files in R2.

Full documentation lives in [`docs/`](./docs). Read the relevant one before
changing anything in that area — each records invariants that are not obvious
from the code:

| Doc                                       | Read it before…                                              |
| ----------------------------------------- | ------------------------------------------------------------ |
| [architecture.md](./docs/architecture.md) | touching routes, caching, `$lib/server/`, or form plumbing   |
| [data-model.md](./docs/data-model.md)     | touching the schema, the R2 key layout, or `titles.csv`      |
| [auth.md](./docs/auth.md)                 | touching auth, roles, or any permission check                |
| [contributing.md](./docs/contributing.md) | running the project, or writing code in it                   |
| [deployment.md](./docs/deployment.md)     | deploying, migrating production, or changing an API response |

## Stack

- **SvelteKit** (Svelte 5, runes) on `@sveltejs/adapter-cloudflare`
- **shadcn-svelte** over bits-ui, in `src/lib/components/ui/` — vendored from the
  CLI, then **deliberately customised**; excluded from linting and formatting
- **Drizzle** over Cloudflare **D1**; olympiad files in **R2**, served from
  `cdn.phoxiv.org`
- **BetterAuth** with GitHub OAuth and the `admin` plugin
- **Bun** as package manager and script runner

## The shape of it, in one screen

`src/hooks.server.ts` builds the per-request context: `locals.db` (Drizzle over
the `DB` binding), `locals.auth` (a per-request BetterAuth instance), and
`locals.user` / `locals.session` from a single session lookup. Loads, actions and
endpoints read those.

```
src/routes/
├── +page          landing (outside (reg); sets its own private cache header)
├── (reg)/         a route group whose ONLY purpose is the private cache header:
│                  olympiads/, blog/, resources/, privacy/, login/, profile/
│                  …except olympiads/[olympiad]/progress/, an endpoint that sets
│                  its own `private, no-store` — it serves per-user progress
├── admin/         deliberately outside (reg) — must never be cached
├── contribute/    also outside (reg); [olympiad]/ and [olympiad]/[year]/ editors
└── api/           Cloudflare's SHARED cache (s-maxage=86400) …
                   olympiads/, olympiads/[olympiad]/, search/, stats/
                   …except auth/[...all]/, which sets no cache headers
```

`src/lib/server/` has one module per concern: `auth`, `auth-cli`, `guard`,
`cache`, `forms`, `uploads`, `storage`, `markdown`, `activity-log`, and `db/`
(`schema.ts` plus `queries/{olympiads,years,content,progress}.ts`). Client-safe
shared code sits directly under `src/lib/`: `types`, `uploads`, `constants`,
`nav`, `posts`, `activity`, `progress`, `forms.svelte`, `auth-client`,
`utils/{date,flag,fuzzy,json,topics}`.

**Roles are `user`, `contributor` and `admin`.** `contributor` is real and
load-bearing: contributors may edit the olympiads listed in their
`assignedOlympiads`, enforced entirely by `$lib/server/guard.ts` — BetterAuth's
plugin is pinned to `adminRoles: ['admin']` and knows nothing about it. Only
`createOlympiad` is admin-only within `/contribute`.

## Rules

1. **Never hand-edit `src/lib/server/db/migrations/`.** Change `schema.ts`, then
   `bun run db:generate`.
2. **Never re-run the shadcn-svelte CLI over `src/lib/components/ui/`.** Those
   files came from the CLI but have been customised since — glass styles, the
   sheet overlay, `input.svelte` — across ~40 commits, and `components.json`
   points at a _live_ registry, so a re-add pulls today's upstream and discards
   all of it. Edit the vendored file, and say in the commit message why. The
   directory is excluded from eslint _and_ prettier, so a tidy-up there is
   invisible to the gate and will not be caught for you.
3. **Never change `CDN_BASE_URL`, the R2 key layout, or `slugifyLabel`.** The
   database stores whole CDN URLs and recovers keys by stripping the prefix; a
   change orphans every object _and_ silently breaks deletion.
4. **Colocate page-only components** next to their route, flat, no `+` prefix, no
   subfolder. They import `PageData` / `ActionData` from `./$types`, which cannot
   resolve under `$lib`. See
   [`(reg)/olympiads/[olympiad]/`](<./src/routes/(reg)/olympiads/[olympiad]>) for
   the reference style.
5. **Call `formToasts` exactly once**, on the component that owns `form`, and pass
   a **single** `Pending` instance down — `has()` must read the map `track()` wrote.
6. **Prefer `actionFail()` over `error()` inside an action.** `error()` replaces
   the page and discards whatever the contributor had typed.
7. **Run `bun run format && bun run check && bun run lint` before every commit,**
   and smoke-test the route under `bun run dev`. There is **no test suite**;
   `svelte-check` plus a click-through is the entire safety net.
8. **Comment the _why_.** Several comments in this codebase record real
   incidents — an infinite submit loop in the admin panel, a data-loss bug in the
   olympiad editor. Do not delete one without understanding what it protects.
9. **Warn me before changing an `/api/*` response shape.** The old body sits in
   Cloudflare's shared cache for up to a day, so I need to purge it — see
   [deployment.md](./docs/deployment.md#purging-the-cache-after-an-api-change).

# Svelte usage

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available Svelte MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
