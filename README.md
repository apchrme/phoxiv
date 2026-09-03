# phoXiv

phoXiv intends to be a comprehensive archive of the high school physics olympiad problems. In particular, we aim to have the most complete and up-to-date set of files for the canonical physics olympiads, with a secondary goal of showcasing the lesser-known olympiads.

Live at **[phoxiv.org](https://phoxiv.org)**.

## What the site does

**Browse the archive.** `/olympiads` lists every olympiad — international,
regional, national and open — and each olympiad's page expands year by year into
its problems, with the papers, solutions and any extra links attached to each.
Files are served from `cdn.phoxiv.org`.

**Search it two ways, both from ⌘K.** The default mode fuzzy-matches problems by
olympiad, year, number and title, and runs entirely in the browser. The second
mode — **deep search** — matches the _text inside_ every uploaded document, so a
visitor who remembers "a rod pivoting on a frictionless bearing" but not which
olympiad it was in has a route to it. Results there are **files, not problems**,
deliberately: one year's PDF often holds every problem of that year. Both modes
share a topic filter and a completion filter that span the whole archive.

**Track what you have solved.** A signed-in visitor can mark any problem done,
optionally with a score, and see per-year totals against each problem's maximum.
Progress is private, never cached, and filterable from the search dialog — "every
relativity problem I haven't done" is a question the archive can answer.

**Contribute.** Contributors edit the olympiads they are assigned: adding years,
uploading and labelling files, editing problem metadata, and importing or
exporting titles, topics and maximum scores as CSV. Uploaded PDFs are text-extracted
**in the browser at the moment they are picked**, so the editor can say "this looks
like a scanned PDF, it won't be searchable" while the file can still be swapped.

**Administer it.** Admins manage roles and per-olympiad assignments, ban and
unban accounts, read an audit log of every change, and maintain the text index.

There is also a blog and a resources page, both written as `.svx`.

## Quickstart

```sh
bun install
cp .env.example .env      # fill in — see docs/contributing.md
bun run db:migrate        # create the local D1 database
bun run dev               # http://localhost:5173
```

You will have an empty database and no admin. Sign in once through GitHub, then
promote yourself — there is no bootstrap admin:

```sh
bunx wrangler d1 execute DB --local \
  --command "UPDATE user SET role = 'admin' WHERE email = 'you@example.com';"
```

Before committing:

```sh
bun run format && bun run check && bun run lint
```

There is **no test suite**. `svelte-check` plus a manual click-through is the
entire safety net, which is why [contributing.md](./docs/contributing.md) carries
a click-through checklist and why running it matters.

## Documentation

Each document records the invariants that are not obvious from the code. Read the
relevant one before changing anything in that area.

| Doc                                       | Contents                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| [architecture.md](./docs/architecture.md) | Request lifecycle, why the route tree is shaped the way it is, the module map    |
| [data-model.md](./docs/data-model.md)     | Every D1 table, the JSON columns, the R2 key layout, `titles.csv`, migrations    |
| [search.md](./docs/search.md)             | Both search modes end to end: extraction, the FTS5 index, the API, the ⌘K dialog |
| [auth.md](./docs/auth.md)                 | BetterAuth on Workers, the three roles, the superadmin, which guard goes where   |
| [contributing.md](./docs/contributing.md) | Setup, every script, local D1/R2, code conventions, the gates                    |
| [deployment.md](./docs/deployment.md)     | Bindings and secrets, deploying, remote migrations, purging the CDN cache        |

[CLAUDE.md](./CLAUDE.md) holds the nine standing rules that apply repo-wide —
including the ones about never hand-editing migrations, never re-running the
shadcn-svelte CLI, and never changing the R2 key layout.

## Stack

SvelteKit (Svelte 5, runes) on a single Cloudflare Worker via
`adapter-cloudflare` · shadcn-svelte over bits-ui, vendored and customised ·
Drizzle over Cloudflare D1, with an FTS5 index for deep search · Cloudflare R2
for the files · BetterAuth with GitHub OAuth · Bun.

Metadata lives in D1, the files in R2. There is no separate backend: every read
is a Drizzle query from inside the Worker.

## Licence

[MIT](./LICENSE.md) © 2026 Teo Kai Wen
