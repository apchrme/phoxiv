# phoXiv

phoXiv intends to be a comprehensive archive of the high school physics olympiad problems. In particular, we aim to have the most complete and up-to-date set of files for the canonical physics olympiads, with a secondary goal of showcasing the lesser-known olympiads.

Live at **[phoxiv.org](https://phoxiv.org)**.

## Quickstart

```sh
bun install
cp .env.example .env      # fill in — see docs/contributing.md
bun run db:migrate        # create the local D1 database
bun run dev               # http://localhost:5173
```

Before committing:

```sh
bun run format && bun run check && bun run lint
```

## Documentation

| Doc                                       | Contents                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| [architecture.md](./docs/architecture.md) | Request lifecycle, why the route tree is shaped the way it is, the module map  |
| [data-model.md](./docs/data-model.md)     | Every D1 table, the JSON columns, the R2 key layout, `titles.csv`, migrations  |
| [auth.md](./docs/auth.md)                 | BetterAuth on Workers, the three roles, the superadmin, which guard goes where |
| [contributing.md](./docs/contributing.md) | Setup, every script, local D1/R2, code conventions, the gates                  |
| [deployment.md](./docs/deployment.md)     | Bindings and secrets, deploying, remote migrations, purging the CDN cache      |

## Stack

SvelteKit (Svelte 5) on a single Cloudflare Worker · shadcn-svelte over bits-ui ·
Drizzle over Cloudflare D1 · Cloudflare R2 for the files · BetterAuth with GitHub
OAuth · Bun.

## Licence

[MIT](./LICENSE.md) © 2026 Teo Kai Wen
