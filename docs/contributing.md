# Contributing

## Prerequisites

- [Bun](https://bun.sh/), the package manager and script runner. `bun.lock` is
  the committed lockfile.
- A GitHub OAuth app, to sign in locally. It is the only way past the login page.
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
| `TRUSTED_ORIGINS`              | comma-separated; `http://localhost:5173` locally                                      |
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

Uploads go to the local simulated bucket, but `CDN_BASE_URL` still points at
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

There is no test suite. `svelte-check` and a manual click-through are the whole
safety net. Before every commit:

```sh
bun run format && bun run check && bun run lint && bun run build
```

For any change near `$lib/pdf-text.ts` or `static/vendor/pdfjs/`, also run
[the bundle check](./deployment.md#the-bundle-check). pdf.js leaking into the
Worker breaks nothing visible.

Then click through whatever you touched under `bun run dev`. What to check on
each route, focusing on things that break silently:

**`/admin`**

- Change a role, assign olympiads to a contributor, ban and unban. Confirm the
  busy state appears on each button, and that a banned user signed in elsewhere
  is signed out on their next request.
- Page through the users table; changing a role must not send you back to page 1.
- Log tab: press **Load more** and check the seam for duplicates.
- Index tab: counts load on first open and not before (check the network tab),
  and reload after each maintenance action and on **Refresh**.

**`/contribute`** and its editors

- `/contribute`: select an existing olympiad; create a new one, and check an id
  with `/` or `.` is refused. As a contributor, the "New olympiad" tab is absent.
- `/contribute/<olympiad>`: add a year, upload and remove an icon, save metadata
  and confirm the icon survived, export and re-import the CSV.
- `/contribute/<olympiad>/<year>`: a duplicate problem number must be blocked
  client-side, and a `javascript:` link refused on save. Reorder and remove
  rows, save, and confirm the right records changed. Upload a file, delete a
  file, delete the year.

**⌘K search, problem mode**

- Hover a result and press Enter: it opens the hovered row. Hover far down a long
  list, narrow the query, press Enter: it opens a visible row, never nothing.
- Close and reopen, including three times faster than the first response: only
  one `/api/search` request and, signed in, one `/progress` request.
- Press Escape, reopen from the desktop nav button: query empty, filters cleared.
- ⌘K works with caps lock on. With a CJK IME, the Enter that commits a candidate
  must not open a result, and ⌘K still closes the dialog mid-composition.
- Signed out: topic filter present, progress filter absent. Signed in:
  `done`/`todo` matches the olympiad page.
- Filters apply before ranking, not to the top 50. With the query cleared and a
  filter set, the first 50 filtered problems list by olympiad, then year
  descending.
- No topic label is ever rendered in a result row.
- Arrowing through the topic dropdown must not move the result list. Escape
  closes the menu, then the dialog.
- Arrow keys on the mode tabs switch mode and keep focus on the tabs; Enter or
  Space moves to the input.
- At 375px, signed in, with a topic filter: everything fits and the close button
  is not clipped.
- A problem titled `<img src=x onerror=alert(1)>` renders as literal text when
  searched, with `<mark>` still around the match.
- `curl -i http://localhost:5173/progress` signed out → `401` with
  `cache-control: private, no-store`.

**⌘K search, files mode** (the Files tab, or ⌘⇧F). The reasoning behind these
checks is in [search.md](./search.md).

- An empty box, and a box cleared after a search, both show the explainer, never
  an error.
- The first query of a session reads "Searching inside files…" during the
  debounce, never "No files contain that phrase."
- Retyping a query sends no second `/api/search/files` request, and the list does
  not blank between keystrokes.
- 4 characters: "type at least 5 characters", no request. 5 characters: searches.
- A 300-character paste: the panel names the 200-character limit and the query's
  length, and sends no request.
- None of `???`, `"black hole"`, `"black hol`, `foo OR bar`, `-NEAR(a b)`,
  `e=mc^2` may 500.
- A dozen-word sentence pasted from a PDF in the archive finds that PDF first.
  A sentence whose words are adjacent in one document returns that one file.
  Backspacing into the last word keeps results.
- A multi-word query with the problem index loaded: the hidden problems panel has
  no `[data-result-index]` rows in DevTools.
- A term in a year-level PDF and a problem PDF gives two rows, one badged "Whole
  year". A PDF attached to several problems gives one row listing them.
- Enter opens the file in a new tab and leaves the dialog open. Middle-click and
  ⌘-click work. Switching back to problem mode restores its filters.
- A PDF containing `<script>alert(1)</script>` renders it as text.
- At 390px: three controls plus the input fit, the close button is not clipped,
  and the olympiad panel stays on screen.

**Files mode, olympiad filter**

- Scope a query to a small olympiad whose files are not in the unfiltered top 20:
  its files come back.
- A query whose phrase match is only outside the scope still returns in-scope
  results from the looser match.
- Switch olympiad and back: each combination shows its own results, and the
  second visit sends no request.
- `curl` the endpoint with `?olympiad=` empty (200, unfiltered); malformed, such
  as a space, a `/` or over 32 characters (400, no `s-maxage`); unknown like
  `iphoo` (200, empty); `rupho` (zero results, even though `rupho-w` exists).
- Typing in the panel matches name and id (`ipho` and `international` both find
  IPhO). Reopening clears the box.
- In the open panel, the arrows move the panel's highlight, Enter picks and
  closes, and Escape closes only the panel. Recheck after any bits-ui upgrade.
- Opened on an olympiad page, that olympiad is pinned first under "On this page",
  appears once, and is not selected. Off an olympiad page there is no pinned row.
- With the filter set, switch to problem mode: the summary bar says the filter
  applies to file search only. Switch back: still set.

**Text extraction** (runs under `bun run dev`)

- Pick an ordinary text PDF in the year editor: before upload, the form reports
  the page and character counts and says "searchable". After upload the row is
  `ok`. The amber "Couldn't read the text" note is the only sign of a dead
  parser; if you see it, check the console.
- A scanned PDF: "no text found" before upload; row `empty` after.
- A `.zip`: "isn't searchable"; row `skipped`, no error.
- With JavaScript disabled, or `static/vendor/pdfjs/` deleted: the upload still
  succeeds and the row is `pending`, not `error`.
- Forge an `extractedText` containing U+0002/U+0003 and
  `<script>alert(1)</script>`, then search a word in it: no spurious highlight,
  and the tag renders as text.
- Delete a file: it stops appearing, and **Prune orphans** reports the row.
  Delete and re-upload with the same label: one row, with the new text.
- **Rebuild index**: results unchanged.

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
