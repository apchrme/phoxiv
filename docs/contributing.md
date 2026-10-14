# Contributing

## Prerequisites

- [Bun](https://bun.sh/), the package manager and script runner. `bun.lock` is
  the committed lockfile.
- A GitHub OAuth app, to sign in locally. It is the only way past the login page
  in a browser. The e2e suite signs in without it (see
  [testing.md](./testing.md#signing-in-without-github)).
- Playwright's Chromium, for the e2e suite: `bunx playwright install chromium`,
  once per machine.
- A Cloudflare account, only if you need the deployed database or bucket.
  Locally, wrangler simulates D1 and R2 on disk.
- Ghostscript and ImageMagick 7, only to re-render the landing page thumbnails
  (see [the corpus band](#the-landing-pages-corpus-band)). The rendered PNGs are
  committed, so a normal checkout does not need them.

## First run

```sh
bun install
cp .env.example .env      # then fill it in, see below
bun run dev               # http://localhost:5173
```

wrangler exposes `.env` to the app through `platform.env`, which is where every
variable is read. Nothing uses `$env/*`, because the values must be available
per request inside the Worker.

| Variable                       | Where to get it                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`           | `openssl rand -base64 32`                                                             |
| `BETTER_AUTH_URL`              | `http://localhost:5173` locally                                                       |
| `GITHUB_CLIENT_ID` / `_SECRET` | a GitHub OAuth app whose callback URL is `<BETTER_AUTH_URL>/api/auth/callback/github` |
| `TRUSTED_ORIGINS`              | comma-separated; `http://localhost:5173` locally, plus `http://phoxiv.org` (below)    |
| `SUPERADMIN_EMAIL`             | optional. The one admin who cannot be demoted or banned. Leave empty to disable       |

Create the local database:

```sh
bun run db:migrate        # applies every migration to the local D1
```

The database starts empty and there is no bootstrap admin. Sign in once through
GitHub to create your user row, then promote yourself:

```sh
bunx wrangler d1 execute DB --local \
  --command "UPDATE user SET role = 'admin' WHERE email = 'you@example.com';"
```

`/contribute` and `/admin` are now reachable.

### Local D1 and R2

wrangler keeps both under `.wrangler/state/`, which is gitignored.

```sh
# query the local database
bunx wrangler d1 execute DB --local --command "SELECT id, name FROM olympiads;"

# run a SQL file against it
bunx wrangler d1 execute DB --local --file=path/to/seed.sql

# browse the schema and data in a GUI
bun run db:studio
```

**Uploads fail under `bun run dev`.** There the R2 binding goes through
wrangler's `getPlatformProxy`, which rejects a `put()` whose body is a stream
([workers-sdk#4373](https://github.com/cloudflare/workers-sdk/issues/4373)), and
every upload (an icon, a document) streams. Try uploads under `bun run preview`,
which runs the real Worker runtime:

- Sign in under `bun run dev` first. Both servers use `.wrangler/state`, and the
  session cookie is per host, not per port, so the session carries over.
- `TRUSTED_ORIGINS` must include `http://phoxiv.org`. `wrangler.jsonc` routes the
  Worker to `phoxiv.org`, so `wrangler dev` rewrites every request's origin to
  `http://phoxiv.org`, and BetterAuth refuses a cookie-bearing POST (such as
  sign-out) from an origin it doesn't trust.

Uploads land in the local simulated bucket, but `CDN_BASE_URL` still points at
production, so an uploaded file's link 404s locally. This is expected.

## Scripts

| Script                      | What it does                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`               | development server                                                                                                            |
| `bun run build`             | production build (also the first step of `preview` and `deploy`)                                                              |
| `bun run preview`           | build, then serve through `wrangler dev`. The closest thing to production                                                     |
| `bun run check`             | `svelte-check` over the whole project. Must report 0 errors                                                                   |
| `bun run check:watch`       | the same, incrementally                                                                                                       |
| `bun run lint`              | `prettier --check` then `eslint`. Must report 0 errors                                                                        |
| `bun run format`            | `prettier --write`. Run it before `lint`                                                                                      |
| `bun run deploy`            | build and push to Cloudflare. See [deployment.md](./deployment.md)                                                            |
| `bun run test:e2e`          | build, then run every e2e spec against a freshly seeded local server. See [testing.md](./testing.md)                          |
| `bun run test:e2e:smoke`    | the same, for the specs tagged `@smoke` only. The pre-commit gate                                                             |
| `bun run test:e2e:ui`       | Playwright's UI mode, for writing and debugging a spec                                                                        |
| `bun run test:e2e:server`   | build and start the e2e server on its own, for `E2E_REUSE`                                                                    |
| `bun run test:e2e:report`   | open the HTML report of the last e2e run                                                                                      |
| `bun run db:generate`       | after editing `schema.ts`: writes a new migration                                                                             |
| `bun run db:migrate`        | apply migrations to the local D1                                                                                              |
| `bun run db:migrate-remote` | apply migrations to the production D1                                                                                         |
| `bun run db:push`           | throwaway local schema sync. It offers to drop the search index, so never point it at anything real                           |
| `bun run db:studio`         | drizzle-kit's database browser                                                                                                |
| `bun run db:generate-auth`  | after changing `authOptions`: regenerates BetterAuth's tables                                                                 |
| `bun run cf-typegen`        | after editing `wrangler.jsonc`: regenerates `src/worker-configuration.d.ts`                                                   |
| `bun run cf-typegen:check`  | checks that file is up to date, without writing                                                                               |
| `bun run index:backfill`    | indexes every already-uploaded file. See [deployment.md](./deployment.md#backfilling-the-text-index)                          |
| `bun run thumbs:render`     | re-renders the landing page thumbnails. See [below](#the-landing-pages-corpus-band)                                           |
| `prepare`                   | `svelte-kit sync`, run by `bun install`. It generates `./$types`; if an editor cannot resolve them, `.svelte-kit/` is missing |

## The gates

Before every commit:

```sh
bun run format && bun run check && bun run lint && bun run test:e2e:smoke
```

Before every push, the full suite:

```sh
bun run test:e2e
```

Both e2e scripts build first, so a broken build fails them.
[testing.md](./testing.md) explains the suite and how to run one spec. A change
to behaviour comes with a spec (see [Tests](#tests)).

For any change near `$lib/pdf-text.ts` or `static/vendor/pdfjs/`, also run
[the bundle check](./deployment.md#the-bundle-check). pdf.js leaking into the
Worker breaks nothing visible.

The suite already covers:

- `tests/e2e/specs/http/`: every route's cache header, the legacy redirects, the
  `/api/*` shapes, and deep search's input validation;
- `tests/e2e/specs/auth/`: the role × route matrix, bans set by hand in SQL, and
  banning and unbanning from the admin panel;
- `tests/e2e/specs/admin/`: changing a role (the submit loop), the users table's
  paging, assigning olympiads, the Log tab's **Load more**, and the Index tab and
  its maintenance actions;
- `tests/e2e/specs/contribute/`: creating an olympiad and the refused ids, the
  icon, adding years, the CSV export and import, the year editor's rows, topics,
  duplicates and links, uploads with their text extraction, and deleting files
  and years (their text leaves the index);
- `tests/e2e/specs/olympiads/`: the index, the olympiad page's 404, what it must
  never render, tracking progress, and the status filter;
- `tests/e2e/specs/search/`: the ⌘K dialog in both modes: reset, Enter, escaping,
  the session caches, filters before ranking, the keyboard (caps lock included),
  failures, the debounce, the length limit, ranking, what a file result is, and
  the olympiad filter and its panel;
- `tests/e2e/specs/pages/`: the landing page, the blog and the theme toggle;
- `tests/e2e/specs/mobile/` and `motion/`: ⌘K at 375 and 390px and the mobile
  nav under emulated touch, and the animated paths with motion on.

Then click through whatever you touched that the suite doesn't reach, under
`bun run dev`, or `bun run preview` for anything that uploads (see
[Local D1 and R2](#local-d1-and-r2)). What only a person can check:

**Anywhere**

- After any change near auth, or a better-auth upgrade: sign in through GitHub
  and sign out again. The suite forges its sessions, so nothing else exercises
  the real OAuth round trip.
- On a real phone, the pages you touched still work by tap. The suite emulates
  touch in Chromium, which misses iOS Safari and the on-screen keyboard.
- Anything you restyled, in dark mode as well as light: Catppuccin Mocha maps
  several tokens to the same colour (see
  [shadcn-svelte components are vendored](#shadcn-svelte-components-are-vendored)).

**⌘K search**

- With a CJK IME, the Enter that commits a candidate must not open a result, and
  ⌘K still closes the dialog mid-composition.
- In files mode, middle-click and ⌘-click on a file row work.

**Text extraction** (under `bun run preview`, since uploads fail under `bun run dev`)

- After a pdf.js upgrade, pick a real archive PDF: the amber "Couldn't read the
  text" note is the only sign of a dead parser; if you see it, check the console.
- A `.zip`: "isn't searchable"; row `skipped`, no error.
- Forge an `extractedText` containing U+0002/U+0003 and
  `<script>alert(1)</script>`, then search a word in it: no spurious highlight,
  and the tag renders as text.

## The landing page's corpus band

The landing page shows a band of eighteen real first pages. They are rendered
offline and committed. Nothing in the Worker or browser rasterises a PDF.

The list is [`src/routes/corpus.ts`](../src/routes/corpus.ts). Both
[`$lib/server/thumbs-cli.ts`](../src/lib/server/thumbs-cli.ts) (which PDFs to
fetch, what to name each PNG) and `CorpusBand.svelte` (the layout) read it. To
change the band, edit the list, then:

```sh
bun run thumbs:render
```

and commit the PNGs it writes to `src/lib/assets/thumbs/`. It needs Ghostscript
and ImageMagick 7 on `PATH`; the script finds `gswin64c` on Windows and `gs`
elsewhere. It re-renders every entry and prints one line per file, so a moved
source shows up as a failure.

Every thumbnail is exactly 420×594, cropped from the top, so each row of tiles
sits on one baseline. `@sveltejs/enhanced-img` re-encodes the committed PNGs to
AVIF/WebP at build time.

The rows drift and wrap using GSAP. The repeated tiles are `aria-hidden` and out
of the tab order; only the eighteen originals are links. Under
`prefers-reduced-motion` nothing moves. Olympiad icons come from `/api/olympiads`
on mount, so they stay current without a D1 read.

## Conventions

### Colocate page-only components

A component used by one route lives next to that route: flat, no `+` prefix, no
subfolder. Only route-agnostic pieces go in `$lib/components/`.

This is required, not just tidy. Colocated components import `PageData` /
`ActionData` from `./$types`, which only resolves inside route directories. Child
components import `PageData` / `ActionData`, not `PageProps`, which belongs to the
page. [`(reg)/olympiads/[olympiad]/`](<../src/routes/(reg)/olympiads/[olympiad]>)
is the reference.

### Reach for the shared primitives before writing markup

Use these instead of writing the markup again:

| Component                    | Use it for                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `forms/Field.svelte`         | a labelled control. Omit `for` when the control is a button; the label becomes a `<span>` |
| `forms/SubmitButton.svelte`  | any submit. Takes the `Pending` key the form was tracked under and owns the busy state    |
| `forms/ConfirmSubmit.svelte` | a destructive submit. The only way this app asks for confirmation; never `window.confirm` |
| `forms/Repeater.svelte`      | a list of rows the contributor adds to and deletes from                                   |
| `EmptyState.svelte`          | an empty list, or a failed fetch. They differ, hence `variant`                            |
| `PageHeader.svelte`          | the block at the top of a page                                                            |
| `OlympiadPicker.svelte`      | picking one or several olympiads                                                          |
| `OlympiadIcon.svelte`        | an olympiad's icon, at one of four named sizes                                            |
| `$lib/resource.svelte.ts`    | a JSON body the browser fetches, with its loading and failed flags                        |
| `$lib/utils/plural.ts`       | `plural(n, noun)`. Numbers are printed raw, with no thousands separators, everywhere      |

Use them even for a single call site, because some encode rules:

- `SubmitButton` removes a hand-typed copy of the action name. A typo in
  `pending.has()` leaves a button permanently enabled with no visible sign.
- `Resource` holds the fetch rules described [below](#client-side-state).
- `ConfirmSubmit` opens an `AlertDialog`, and confirming calls `requestSubmit()`,
  so `use:enhance` and `Pending` run as normal. Don't add a second way to
  confirm. (`TrackOptions.guard` is different: it blocks a submit and toasts
  why.)

### Tests

A change to behaviour comes with a spec in `tests/e2e/specs/`, and a bug fix with
a regression spec that fails without the fix. Read
[testing.md](./testing.md#writing-a-spec) first: specs import `test` from
`tests/e2e/support/test.ts`, select by role and accessible name, and cite the
comment they guard. When a spec takes over a check from [the gates](#the-gates),
delete the check there.

### Comment the _why_

Every exported symbol gets a doc comment. The useful comments record a
non-obvious invariant: why `authOptions` uses `satisfies`, why a prop is
`$bindable`, why an input must not sit inside an `{#if}`. Don't restate the
function name. Several comments record real incidents; understand what one
protects before deleting it.

### Server code goes under `$lib/server/`

SvelteKit refuses to bundle `$lib/server/` into the client, so the build enforces
the boundary. Code both sides need, such as the upload allow-list, the topic list
and the tag list, goes in a client-safe module so it is written once. See
[architecture.md](./architecture.md).

### Forms

Every action returns the `{ action, success, error }` envelope through `ok()` /
`actionFail()` from `$lib/server/forms.ts`. The client side is `formToasts` and
`Pending` from `$lib/forms.svelte.ts`.

- Call `formToasts` once, on the component that owns `form`.
- Pass a single `Pending` instance down to every child that submits.
- Use `actionFail()`, not `error()`, inside an action. `error()` replaces the page
  and throws away what the contributor typed.

The full contract is in
[architecture.md](./architecture.md#the-action-result-envelope).

### Client-side state

Svelte 5 runes throughout. Choose between these four:

| Use                              | When                                                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `$state`                         | ordinary reactive values that drive markup                                                                                 |
| `$state.raw`                     | a collection replaced whole, never mutated, and read on a hot path. The ⌘K dialog's `index` and `progress` are raw         |
| a plain `let`                    | a flag that gates a fetch but drives no markup. If an effect reads and writes it, making it reactive makes the effect loop |
| a class in a `.svelte.ts` module | related values that change together or must survive an unmount: `Pending`, `DeepSearch`, `Resource`                        |

Effects:

- Read every dependency synchronously at the top. Anything read after an `await`
  or inside a `setTimeout` is not tracked, which is usually what you want: if a
  fetch's response were tracked, it would re-trigger the fetch.
- Use the teardown to cancel. The deep-search debounce is the effect's teardown
  (`clearTimeout` plus `abort()`). See
  [search.md](./search.md#the-debounce-is-the-effects-teardown).

Fetches:

- Set a fetch-once guard only on success, so a failure retries next time.
- Pair it with an in-flight flag, or several quick opens fire several requests.
  Make that flag a plain `let`, not `$state`: the guards run inside an `$effect`,
  and a reactive flag would make the effect refetch on every failure.
- Check `res.ok` before `res.json()`. An error page's HTML makes `json()` throw,
  and the UI then claims there is no data instead of reporting a failure.

### Styling and theming

Tailwind v4, configured in CSS; there is no `tailwind.config.js`.
[`src/app.css`](../src/app.css) is the entry point and holds the design tokens.
`src/styles/` holds `base.css`, `prose.css` and `theme.css`.

- **Palette.** Catppuccin: Latte for light, Mocha for dark, written as `oklch()`
  with the source hex in a trailing comment. Keep that comment when editing a
  token; it is the only record of which Catppuccin colour it is.
- **Tokens.** Declared on `:root`, overridden under `.dark`, and exported to
  Tailwind through `@theme inline`. Utilities like `bg-card` work in both themes
  without a `dark:` variant, so prefer a semantic token over a literal colour.
- **Dark mode.** [`mode-watcher`](https://github.com/svecosystem/mode-watcher)
  toggles `.dark` on `<html>`, and
  `@custom-variant dark (&:where(.dark, .dark *))` follows the class. `html` and
  `html.dark` set their own background so the page never flashes the wrong
  colour.
- **Surface utilities.** `@utility` rules, because the same look applies to
  different elements. If the markup repeats too, make a component instead.

  | Utility          | What it is                                               |
  | ---------------- | -------------------------------------------------------- |
  | `glass`          | the frosted panel of the nav pills                       |
  | `glass-hairline` | the divider between rows inside a `glass` panel          |
  | `file-input`     | a bare `<input type="file">` styled to match the buttons |
  | `no-scrollbar`   | scrolls without a visible scrollbar (the sidebar)        |

- **`data-*` variants.** `data-open`, `data-closed`, `data-checked`,
  `data-unchecked`, `data-selected`, `data-disabled`, `data-active`, `data-horizontal` and
  `data-vertical` cover both of bits-ui's spellings (`[data-state='open']` and
  `[data-open]`). Use them rather than matching either attribute.
- **Fonts.** DM Sans and JetBrains Mono, self-hosted through
  `@fontsource-variable`. Mono has a meaning: it marks a year or a problem
  number.
- **Motion.** Anything animated gets `motion-reduce:transition-none`.

### shadcn-svelte components are vendored

`src/lib/components/ui/` came from the shadcn-svelte CLI. **Never re-run the CLI
over it** (CLAUDE.md rule 2). `components.json` points at a live, unpinned
registry, so a re-add pulls today's upstream and discards every customisation:
the backdrop-blur overrides, the sheet overlay, `input.svelte`'s `data-slot`
handling, `tabs-trigger.svelte`'s dark active state, and
`tooltip-content.svelte`'s `arrowClasses` and `portalProps` props, which
[`SignInToTrack.svelte`](<../src/routes/(reg)/olympiads/[olympiad]/SignInToTrack.svelte>)
depends on.

Edit the vendored file directly and say why in the commit message. The directory
is excluded from eslint and prettier, so the gates will not catch a regression
there.

Check any vendored change in dark mode. Catppuccin Mocha maps `--muted`,
`--accent`, `--border` and `--input` all to Surface 1, so a component that layers
two of them can lose its contrast in dark mode while looking fine in light mode.
That is why `tabs-trigger.svelte` has its own dark active state.

### Migrations are generated

Never hand-edit `src/lib/server/db/migrations/`. See
[data-model.md](./data-model.md#migration-workflow).
