# Project Information

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

- `(reg)`: Route group containing regular pages that are cached in the local cache. API endpoints and the contribute page are excluded from this route group.
  - `olympiads/`: lists all olympiads
  - `login/`: login page
  - `profile/`: profile of user
  - `admin/`: admin panel for managing users
  - `privacy/`: privacy policy
- `api/`: API endpoints cached in a **shared cache** to reduced DB load. Since a shared cache (Cloudflare's cache) is used, it also allows for manual reloading of the cache using Cloudflare's dashboard.
  - `search/`: contains the search index used for the global fuzzy search
  - `stats/`: endpoint for the statistics on the landing page.
  - `auth/`: endpoint for authentication (see auth section below)
  - `olympiads`: endpoint for olympiad list
    - `[olympiad]`: endpoint for the olympiad files
- `contribute/`: page for users to contribute. Currently, only admins can use this page.
  - `[olympiad]`: edit olympiad metadata
    - `[year]`: edit files and metadata of a year

## Authentication

Authentication is implemented with [BetterAuth](https://better-auth.com/). The BetterAuth instance is found in `src/lib/server/auth.ts`. It is a function rather than a constant, as the Cloudflare D1 binding is only known at runtime. Hence, when using the BetterAuth CLI to generate the database schema based on the BetterAuth instance, we use separate code that pretends that the DB is just some regular path. The client code interacts with the BetterAuth server using the auth client found in `src/lib/auth-client.ts`. The default SvelteKit handler doesn't work due to quirks of Cloudflare Workers, so we hardcode the callback URL handling in `src/routes/api/auth/[...all]/+server.ts`.

### User types

Currently, there are only two user types: `user` and `admin`, which are the defaults configured in BetterAuth's admin plugin. There is also a superadmin, which is an admin that cannot be demoted.

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
