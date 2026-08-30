# Contributing

## Prerequisites

- **[Bun](https://bun.sh/)** — the package manager and script runner. `npm` and
  `pnpm` will mostly work, but `bun.lock` is what is committed.
- A **Cloudflare account** if you want to touch the deployed database or bucket.
  You do not need one to run the app locally: wrangler simulates D1 and R2 on
  disk under `.wrangler/`.
- A **GitHub OAuth app** for signing in locally. It takes a minute to create and
  is the only way to get past the login page.

## First run

```sh
bun install
cp .env.example .env      # then fill it in — see below
bun run dev               # http://localhost:5173
```

`.env` supplies the Worker's environment for local development; wrangler exposes
it through `platform.env`, which is where the app reads every variable from.
Nothing is read through `$env/*`, because these values have to be available
per-request inside the Worker.

| Variable                       | Where to get it                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`           | `openssl rand -base64 32`                                                             |
| `BETTER_AUTH_URL`              | `http://localhost:5173` locally                                                       |
| `GITHUB_CLIENT_ID` / `_SECRET` | a GitHub OAuth app whose callback URL is `<BETTER_AUTH_URL>/api/auth/callback/github` |
| `TRUSTED_ORIGINS`              | comma-separated; `http://localhost:5173` locally                                      |
| `SUPERADMIN_EMAIL`             | optional — the one admin that cannot be demoted or banned. Leave empty to disable     |

Then create the local database:

```sh
bun run db:migrate        # applies every migration to the local D1
```

You will have an empty database. Sign in once through GitHub to create your user
row, then promote yourself — there is no bootstrap admin:

```sh
bunx wrangler d1 execute DB --local \
  --command "UPDATE user SET role = 'admin' WHERE email = 'you@example.com';"
```

`/contribute` and `/admin` are now reachable.

### Local D1 and R2

Both are simulated by wrangler under `.wrangler/state/`, which is gitignored.
Useful commands:

```sh
# query the local database
bunx wrangler d1 execute DB --local --command "SELECT id, name FROM olympiads;"

# run a SQL file against it
bunx wrangler d1 execute DB --local --file=path/to/seed.sql

# browse the schema and data in a GUI
bun run db:studio
```

R2 works out of the box for uploads, but the files are only written to the local
simulated bucket. `CDN_BASE_URL` still points at production, so an uploaded file's
link will 404 locally — expected, and not worth working around.

## Scripts

| Script                      | When to run it                                                               |
| --------------------------- | ---------------------------------------------------------------------------- |
| `bun run dev`               | development server                                                           |
| `bun run build`             | production build (also the first half of `preview` and `deploy`)             |
| `bun run preview`           | build, then serve it through `wrangler dev` — the closest thing to prod      |
| `bun run check`             | `svelte-check` over the whole project. **Must be 0 errors**                  |
| `bun run check:watch`       | the same, incrementally                                                      |
| `bun run lint`              | `prettier --check` + `eslint`. **Must be 0 errors**                          |
| `bun run format`            | `prettier --write` — run this before `lint`                                  |
| `bun run deploy`            | build and push to Cloudflare. See [deployment.md](./deployment.md)           |
| `bun run db:generate`       | after editing `schema.ts` — writes a new migration                           |
| `bun run db:migrate`        | apply migrations to the **local** D1                                         |
| `bun run db:migrate-remote` | apply migrations to the **production** D1                                    |
| `bun run db:push`           | throwaway local schema sync. Never for a change you intend to ship           |
| `bun run db:studio`         | drizzle-kit's database browser                                               |
| `bun run db:generate-auth`  | after changing `authOptions` — regenerates BetterAuth's tables               |
| `bun run cf-typegen`        | after editing `wrangler.jsonc` — regenerates `src/worker-configuration.d.ts` |

## The gates

There is **no test suite**. `svelte-check` plus a manual click-through is the
entire safety net, which makes both non-negotiable:

```sh
bun run format && bun run check && bun run lint && bun run build
```

Run that before every commit, and exercise whatever route you touched under
`bun run dev`. The routes worth clicking through, and what regresses silently on
each:

- **`/admin`** — change a role, assign olympiads to a contributor, ban and unban,
  check the log renders. Confirm the **busy state actually appears**; it is the
  thing most likely to break without a visible symptom.
- **`/contribute/<olympiad>`** — add a year, upload an icon, remove it, save
  metadata and confirm the uploaded icon survived, export and re-import the CSV.
- **`/contribute/<olympiad>/<year>`** — save metadata with a duplicate problem
  number (must be blocked client-side), reorder and remove rows then save and
  confirm the right records changed, upload a file, delete a file, delete the year.
- **`/contribute`** — select an existing olympiad, create a new one.
- **⌘K search** — type, hover a result then press Enter (must navigate to the
  hovered row), close and reopen and confirm **no second `/api/search` request**.

## Conventions

### Colocate page-only components

A component used by exactly one route lives **next to that route**, flat, with no
`+` prefix and no subfolder. Only route-agnostic pieces go in `$lib/components/`.

This is not just tidiness: colocated components import `PageData` / `ActionData`
from `./$types`, and that specifier resolves through a `rootDirs` mapping
`.svelte-kit/tsconfig.json` sets up **for route directories only**. The same file
under `$lib` cannot resolve it.

Child components import `PageData` / `ActionData`, not `PageProps` — that bundle
belongs to the page.
[`(reg)/olympiads/[olympiad]/`](<../src/routes/(reg)/olympiads/[olympiad]>) is the
reference for the style.

### Comment the _why_

Every exported symbol gets a doc comment, and the comments that matter are the
ones carrying a non-obvious invariant — why `authOptions` uses `satisfies`, why a
prop is `$bindable`, why an input must not be wrapped in an `{#if}`. A comment
restating the function name is noise; a comment recording the bug that shaped the
code is the point. Several existing comments record real incidents. Do not delete
them without understanding what they are protecting.

### Server code goes under `$lib/server/`

SvelteKit refuses to bundle anything under `$lib/server/` into the client, so the
boundary is enforced by the build. Anything both sides need — the upload
allow-list, the topic list, the tag list — goes in a client-safe module so the
rule is stated once. See [architecture.md](./architecture.md).

### Forms

Every action returns the `{ action, success, error }` envelope via `ok()` /
`actionFail()` from `$lib/server/forms.ts`; the client side is `formToasts` and
`Pending` from `$lib/forms.svelte.ts`. Call `formToasts` **once**, on the
component that owns `form`, and pass a **single** `Pending` instance down to
every child that submits. The full contract is in
[architecture.md](./architecture.md#the-action-result-envelope).

Prefer `actionFail()` over `error()` inside an action: `error()` replaces the
page with the error template, discarding whatever the contributor had typed.

### shadcn-svelte components are vendored

`src/lib/components/ui/` came from the shadcn-svelte CLI, but **never re-run the
CLI over it** — see rule 2 in [CLAUDE.md](../CLAUDE.md). `components.json` points
at an unpinned live registry, so a re-add pulls whatever upstream looks like
today and discards everything that has been customised since: the backdrop-blur
overrides, the sheet overlay, `input.svelte`'s `data-slot` handling, and
`tooltip-content.svelte`'s `arrowClasses` and `portalProps` props, which upstream
does not expose and
[`SignInToTrack.svelte`](<../src/routes/(reg)/olympiads/[olympiad]/SignInToTrack.svelte>)
depends on.

Edit the vendored file directly, and say in the commit message why. The directory
is excluded from eslint **and** prettier, so a reformat or a lint tidy-up there
passes both gates unseen — nothing will catch a regression for you.

### Migrations are generated

Never hand-edit `src/lib/server/db/migrations/`. See
[data-model.md](./data-model.md#migration-workflow).
