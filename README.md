# phoXiv

phoXiv aims to be a comprehensive archive of high-school physics olympiad
problems. The main goal is the most complete and up-to-date set of files for the
canonical olympiads. A secondary goal is to showcase the lesser-known ones.

Live at **[phoxiv.org](https://phoxiv.org)**.

## What the site does

- **Browse.** `/olympiads` lists every olympiad: international, regional,
  national and open. Each olympiad's page lists its years, and each year lists
  its problems with the papers, solutions and links attached. Files are served
  from `cdn.phoxiv.org`.
- **Search, from ⌘K.** There are two modes:
  - The default mode fuzzy-matches problems by olympiad, year, number and title. It runs entirely in the browser, and can filter by topic and by whether you've done a problem.
  - _Deep search_ matches the text inside every uploaded document. Its results are files, not problems, because one PDF often holds a whole year's problems.
- **Track progress.** Signed-in visitors can mark problems done, optionally with
  a score, and see per-year totals. Progress is private and never cached.
- **Contribute.** Contributors edit the olympiads assigned to them:
  - add years
  - upload and label files
  - edit problem metadata
  - import and export titles, topics and maximum scores as CSV

  PDFs are text-extracted in the browser when they are picked. That way the editor can warn about a scanned (unsearchable) PDF before it is saved.

- **Administer.** Admins do four things:
  - manage roles and olympiad assignments
  - ban and unban accounts
  - read the activity log
  - maintain the search index

There is also a blog and a resources page, both written in mdsvex (`.svx`).

## Quickstart

```sh
bun install
cp .env.example .env      # fill in — see docs/contributing.md
bun run db:migrate        # create the local D1 database
bun run dev               # http://localhost:5173
```

You start with an empty database and no admin. Sign in once with GitHub, then
promote yourself:

```sh
bunx wrangler d1 execute DB --local \
  --command "UPDATE user SET role = 'admin' WHERE email = 'you@example.com';"
```

Before committing:

```sh
bun run format && bun run check && bun run lint
```

There is **no test suite**. Type-checking plus a manual click-through is the
whole safety net. [contributing.md](./docs/contributing.md#the-gates) has the
checklist.

## Documentation

Each doc records the rules that aren't obvious from the code. Read the relevant
one before changing that area.

| Doc                                       | Covers                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| [architecture.md](./docs/architecture.md) | Request lifecycle, caching and the route tree, the module map          |
| [data-model.md](./docs/data-model.md)     | The D1 tables, JSON columns, R2 key layout, `titles.csv`, migrations   |
| [search.md](./docs/search.md)             | Both search modes: text extraction, the FTS5 index, the API, ⌘K dialog |
| [auth.md](./docs/auth.md)                 | BetterAuth on Workers, the three roles, the superadmin, the guards     |
| [contributing.md](./docs/contributing.md) | Setup, scripts, local D1/R2, code conventions, the pre-commit checks   |
| [deployment.md](./docs/deployment.md)     | Bindings and secrets, deploying, production migrations, cache purges   |

[CLAUDE.md](./CLAUDE.md) lists the repo-wide rules. Examples: never hand-edit
migrations, never re-run the shadcn-svelte CLI, never change the R2 key layout.

## Stack

- SvelteKit (Svelte 5, runes), deployed as a single Cloudflare Worker
- shadcn-svelte over bits-ui, vendored and customised
- Drizzle over Cloudflare D1, with an SQLite FTS5 index for deep search
- Cloudflare R2 for the files
- BetterAuth with GitHub sign-in
- Bun

There is no separate backend. Every read is a Drizzle query made from inside the
Worker.

## Licence

[MIT](./LICENSE.md) © 2026 Teo Kai Wen
