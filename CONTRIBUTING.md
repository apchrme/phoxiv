# Contributing

Note: You can now contribute content directly through the website itself! Contact me at apochrome@proton.me to apply to be a contributor.

## Stack

- Framework: SvelteKit
- UI Library: shadcn-svelte (based on the bits-ui primitives)
- Database ORM: Drizzle

Cloudflare D1 is used to store metadata of the olympiad files and Cloudflare R2 to store the olympiad files themselves. The database schema can be found in the database folder `src/lib/server/db`.

## Project structure

Overall, the project is structured the same as a regular SvelteKit project, but there are some additional items.

### `src`

- `hooks.server.ts`: Server hooks. The connection to the D1 database occurs here, since it is so commonly used. Individual pages import the `locals.DB` object created here. The R2 connection is only necessary for contributors, so it is not connected in server hooks.

### `$lib` (i.e. `src/lib`)

- `components/`: contains all the components that are used across the project
  - `ui/`: contains the shadcn-svelte components
- `posts/`: contains the blog posts
- `server/db`: database information. the migrations here are generated from the schema using drizzle-kit, so the migration files should never be modified directly.
- `utils/flag.ts`: a utility file used to render nice-looking flags in the olympiads page

### `routes`

- `olympiads/`: lists all olympiads
- `api/`: api endpoints. These are often cached to reduced DB load.
  - `search/`: contains the search index used for the global fuzzy search
  - `stats/`: endpoint for the statistics on the landing page.
  - `auth/`: endpoint for authentication (see auth section below)
  - `olympiads`: endpoint for olympiad list
    - `[olympiad]`: endpoint for the olympiad files
- `contribute/`: page for users to contribute. Currently, only admins can use this page.
- `login/`: login page
- `profile/`: profile of user
- `admin/`: admin panel for managing users

## Authentication

Authentication is implemented with [BetterAuth](https://better-auth.com/). The BetterAuth instance is found in `src/lib/server/auth.ts`. It is a function rather than a constant, as the Cloudflare D1 binding is only known at runtime. Hence, when using the BetterAuth CLI to generate the database schema based on the BetterAuth instance, we use separate code that pretends that the DB is just some regular path. The client code interacts with the BetterAuth server using the auth client found in `src/lib/auth-client.ts`. The default SvelteKit handler doesn't work due to quirks of Cloudflare Workers, so we hardcode the callback URL handling in `src/routes/api/auth/[...all]/+server.ts`.

### User types

Currently, there are only two user types: `user` and `admin`, which are the defaults configured in BetterAuth's admin plugin. There is also a superadmin, which is an admin that cannot be demoted.
