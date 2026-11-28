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
  a score, and see per-year totals. Signed in, the home page is a dashboard of
  their progress across the archive. Progress is private and never cached.
- **Earn badges.** A badge is earned by completing enough problems that match
  its rule: any problem, problems by topic or olympiad, or a hand-picked list,
  optionally within a score range. `/badges` lists them all with how many people
  hold each; a badge can keep its requirement hidden until earned.
- **Contribute.** Contributors edit the olympiads assigned to them:
  - add years
  - upload and label files
  - edit problem metadata
  - import and export titles, topics and maximum scores as CSV

  PDFs are text-extracted in the browser when they are picked. That way the editor can warn about a scanned (unsearchable) PDF before it is saved.

- **Administer.** Admins:
  - manage roles and olympiad assignments
  - ban and unban accounts
  - create and edit badges
  - read the activity log
  - maintain the search index

The about, resources and privacy pages are written in mdsvex (`.svx`).

## Quickstart

```sh
bun install
cp .env.example .env      # fill in — see docs/contributing.md
bun run db:migrate        # create the local D1 database
bun run dev               # http://localhost:5173
```

You start with an empty database and no admin. Sign in once with GitHub or Google, then
promote yourself:

```sh
bunx wrangler d1 execute DB --local \
  --command "UPDATE user SET role = 'admin' WHERE email = 'you@example.com';"
```

Before committing, and before pushing:

```sh
bunx playwright install chromium   # once per machine
bun run format && bun run check && bun run lint && bun run test:e2e:smoke
bun run test:e2e                   # the full suite, before pushing
```

The end-to-end suite is Playwright, run against the production build in local
workerd on a database seeded from empty each run; it never touches Cloudflare.
GitHub Actions runs the lint, the type check and the full suite on every pull
request. [testing.md](./docs/testing.md) explains it and what it covers, and
[contributing.md](./docs/contributing.md#the-gates) lists the checks that are
still done by hand.

## Documentation

Each doc records the rules that aren't obvious from the code. Read the relevant
one before changing that area.

| Doc                                       | Covers                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| [architecture.md](./docs/architecture.md) | Request lifecycle, caching and the route tree, the module map          |
| [data-model.md](./docs/data-model.md)     | The D1 tables, badges, JSON columns, R2 key layout, `titles.csv`       |
| [search.md](./docs/search.md)             | Both search modes, the in-browser PDF parser, the FTS5 queries, ⌘K     |
| [auth.md](./docs/auth.md)                 | BetterAuth on Workers, the three roles, the superadmin, the guards     |
| [contributing.md](./docs/contributing.md) | Setup, scripts, local D1/R2, code conventions, the pre-commit checks   |
| [deployment.md](./docs/deployment.md)     | Config and secrets, deploying, migrations, backfills, D1 usage, purges |
| [testing.md](./docs/testing.md)           | The Playwright suite: running it, the e2e server, seed data, sign-in   |

[CLAUDE.md](./CLAUDE.md) lists the repo-wide rules. Examples: never hand-edit
migrations, never re-run the shadcn-svelte CLI, never change the R2 key layout.

## Stack

- SvelteKit (Svelte 5, runes), deployed as a single Cloudflare Worker
- shadcn-svelte over bits-ui, vendored and customised
- Drizzle over Cloudflare D1, with an SQLite FTS5 index for deep search
- Cloudflare R2 for the files
- BetterAuth with GitHub and Google sign-in
- Bun
- Playwright, for the end-to-end suite

There is no separate backend. Every read is a Drizzle query made from inside the
Worker.

## Licence

<a href="https://phoxiv.org/">phoXiv</a> © 2026 is licensed under <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a><img src="https://mirrors.creativecommons.org/presskit/icons/cc.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;"><img src="https://mirrors.creativecommons.org/presskit/icons/by.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;"><img src="https://mirrors.creativecommons.org/presskit/icons/nc.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;"><img src="https://mirrors.creativecommons.org/presskit/icons/sa.svg" alt="" style="max-width: 1em;max-height:1em;margin-left: .2em;">
