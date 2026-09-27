# phoXiv

An archive of high-school physics olympiad problems. SvelteKit on a single
Cloudflare Worker, with metadata in D1 and files in R2.

The docs in [`docs/`](./docs) record rules that aren't obvious from the code.
Read the relevant one first:

| Doc                                       | Read it before changing…                                 |
| ----------------------------------------- | -------------------------------------------------------- |
| [architecture.md](./docs/architecture.md) | routes, caching, `$lib/server/`, or form handling        |
| [data-model.md](./docs/data-model.md)     | the schema, the R2 key layout, or `titles.csv`           |
| [search.md](./docs/search.md)             | either search mode, PDF extraction, or the FTS5 index    |
| [auth.md](./docs/auth.md)                 | auth, roles, or any permission check                     |
| [contributing.md](./docs/contributing.md) | anything — it covers setup and code conventions          |
| [deployment.md](./docs/deployment.md)     | deploys, production migrations, or an API response shape |

## Stack

- **SvelteKit** (Svelte 5, runes) on `@sveltejs/adapter-cloudflare`
- **shadcn-svelte** over bits-ui in `src/lib/components/ui/`, vendored and then
  customised. Excluded from eslint and prettier.
- **Drizzle** over Cloudflare **D1**. Files in **R2**, served from `cdn.phoxiv.org`.
- **BetterAuth** with GitHub OAuth and the `admin` plugin
- **Bun** as package manager and script runner

## Overview

`src/hooks.server.ts` sets up each request:

- `locals.db`: Drizzle over the `DB` binding
- `locals.auth`: a per-request BetterAuth instance
- `locals.user` and `locals.session`: from one session lookup

Loads, actions and endpoints use these.

Routes are grouped by how they are cached:

```
src/routes/
├── +page         landing page; sets the private cache header itself
├── (reg)/        private browser cache (4h): olympiads, blog, resources, privacy, login, profile
│                 except olympiads/[olympiad]/progress/ — per-user, `private, no-store`
├── admin/        never cached
├── contribute/   never cached; the olympiad and year editors
├── progress/     per-user progress for the ⌘K dialog, `private, no-store`
└── api/          Cloudflare's shared cache (s-maxage=86400)
                  except auth/[...all]/, which sets no cache headers
```

**A `+server.ts` does not run layout loads, so layout guards don't protect it.**
Endpoints under `admin/` (`reindex/`, `index-stats/`, `activity/`) each call
`requireAdmin` themselves. Do the same for any new endpoint.

The full module inventory is in
[architecture.md](./docs/architecture.md#the-module-map). Shared UI lives in
`src/lib/components/`. Check there before writing new markup; see
[contributing.md](./docs/contributing.md#reach-for-the-shared-primitives-before-writing-markup).

**Roles are `user`, `contributor` and `admin`.** Contributors can edit the
olympiads in their `assignedOlympiads`. That check lives only in
`$lib/server/guard.ts`. BetterAuth's admin plugin is pinned to
`adminRoles: ['admin']` and knows nothing about contributors. Within
`/contribute`, only `createOlympiad` is admin-only.

## Rules

1. **Never hand-edit `src/lib/server/db/migrations/`.** Change `schema.ts`, then
   run `bun run db:generate`. The one exception is the FTS5 virtual table and its
   triggers, which are written by hand. Because of them, **never point `db:push`
   at a real database**. See
   [data-model.md](./docs/data-model.md#the-full-text-index).
2. **Never re-run the shadcn-svelte CLI over `src/lib/components/ui/`.** The files
   have been customised heavily since they were generated. `components.json`
   points at the live registry, so re-adding a component overwrites those changes
   with today's upstream. Edit the file directly and explain why in the commit
   message. The folder is excluded from eslint and prettier, so mistakes there
   won't be caught for you.
3. **Never change `CDN_BASE_URL`, the R2 key layout, or `slugifyLabel`.** The
   database stores full CDN URLs and gets R2 keys back by stripping the prefix.
   Changing any of these orphans every stored object and breaks deletion.
4. **Put page-only components next to their route**: flat, no `+` prefix, no
   subfolder. They import `PageData` / `ActionData` from `./$types`, which only
   resolves inside route folders. See
   [`(reg)/olympiads/[olympiad]/`](<./src/routes/(reg)/olympiads/[olympiad]>) for
   the reference style.
5. **Call `formToasts` exactly once**, on the component that owns `form`, and pass
   a **single** `Pending` instance down as a prop. `has()` only sees submissions
   tracked by the same instance's `track()`.
6. **Use `actionFail()`, not `error()`, inside an action.** `error()` replaces the
   page and throws away whatever the contributor had typed.
7. **Run `bun run format && bun run check && bun run lint` before every commit,**
   and click through the affected route under `bun run dev`. There is no test
   suite.
8. **Comment the _why_.** Some comments record real incidents, such as an
   infinite submit loop in the admin panel and a data-loss bug in the olympiad
   editor. Don't delete one without understanding what it prevents.
9. **Warn me before changing an `/api/*` response shape.** The old response stays
   in Cloudflare's shared cache for up to a day, so I need to purge it. See
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
