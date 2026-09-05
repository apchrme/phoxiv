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

| Script                      | When to run it                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run dev`               | development server                                                                                                                                                               |
| `bun run build`             | production build (also the first half of `preview` and `deploy`)                                                                                                                 |
| `bun run preview`           | build, then serve it through `wrangler dev` — the closest thing to prod                                                                                                          |
| `bun run check`             | `svelte-check` over the whole project. **Must be 0 errors**                                                                                                                      |
| `bun run check:watch`       | the same, incrementally                                                                                                                                                          |
| `bun run lint`              | `prettier --check` + `eslint`. **Must be 0 errors**                                                                                                                              |
| `bun run format`            | `prettier --write` — run this before `lint`                                                                                                                                      |
| `bun run deploy`            | build and push to Cloudflare. See [deployment.md](./deployment.md)                                                                                                               |
| `bun run db:generate`       | after editing `schema.ts` — writes a new migration                                                                                                                               |
| `bun run db:migrate`        | apply migrations to the **local** D1                                                                                                                                             |
| `bun run db:migrate-remote` | apply migrations to the **production** D1                                                                                                                                        |
| `bun run db:push`           | throwaway local schema sync. Never for a change you intend to ship — and since the FTS5 migration it will offer to **drop the search index**, so never point it at anything real |
| `bun run db:studio`         | drizzle-kit's database browser                                                                                                                                                   |
| `bun run db:generate-auth`  | after changing `authOptions` — regenerates BetterAuth's tables                                                                                                                   |
| `bun run cf-typegen`        | after editing `wrangler.jsonc` — regenerates `src/worker-configuration.d.ts`                                                                                                     |
| `bun run cf-typegen:check`  | verifies that file is up to date without writing it                                                                                                                              |
| `bun run index:backfill`    | sweeps every already-uploaded file into the text index; see [search.md](./search.md#operating-the-index) and [deployment.md](./deployment.md#backfilling-the-text-index)         |
| `prepare`                   | `svelte-kit sync`, run by `bun install`. Never run by hand — it is what generates `./$types`, so a missing `.svelte-kit/` is why an editor suddenly cannot resolve them          |

## The gates

There is **no test suite**. `svelte-check` plus a manual click-through is the
entire safety net, which makes both non-negotiable:

```sh
bun run format && bun run check && bun run lint && bun run build
```

One more gate applies to any change near `$lib/pdf-text.ts` or the vendored
build: the **server-bundle check** in
[deployment.md](./deployment.md#the-bundle-check). pdf.js leaking into the Worker
breaks nothing visibly — everything still works — so it needs a number rather
than a glance.

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
- **⌘K search** — the dialog carries the most manual-only behaviour in the app,
  so it gets its own list:
  - Type, hover a result then press **Enter** — it must navigate to the _hovered_
    row, not the last one the arrows were on.
  - Hover a row **far down** a long list, then narrow the query until a short
    list lands, and press **Enter**: it must open a row that is on screen, never
    nothing at all. The focused index is clamped where it is _read_, so a hover
    left behind by a list that has since shrunk cannot point past the end of it.
  - Close and reopen: **no second `/api/search` request**. Signed in, close and
    reopen: **no second `/progress` request** either. Both caches are
    session-long, and the reset-on-open only clears what the user chose. Then do
    it three times in a row, **faster than the first response lands**: still one
    of each. The fetch-once guards are set only on success, so the in-flight
    check beside them is all that stands between an impatient ⌘K and three real
    D1 reads — `/progress` is `private, no-store` and is never served from a cache.
  - Press **Escape**, then reopen with the _desktop nav button_: the query must
    be empty and every filter cleared. Three ways in and four ways out, and only
    two of them run code of ours — this is what that reset exists for.
  - Open it with **caps lock on**. `e.key` is `'K'`, and the naive comparison
    this replaced silently stopped ⌘K working at all.
  - With a Japanese, Chinese or Korean IME, the **Enter that commits a candidate**
    must not open a result — and ⌘K must still close the dialog mid-composition,
    which is why the composition guard sits below the chords rather than above
    them.
  - Signed out: the topic filter is present and the progress filter is absent.
    Signed in: `done`/`todo` must agree with the olympiad page for the same
    problem — mark one done there, reopen ⌘K, and the `todo` list has dropped it.
  - Apply a filter with a query long enough to hit `MAX_RESULTS`, to confirm
    filtering happens **before** ranking rather than over the ranked 50.
  - Clear the query with a filter still set: the first 50 filtered problems must
    list, ordered by olympiad then year descending.
  - No topic label may be rendered in a result row, ever.
  - Open the topic dropdown _inside_ the dialog and arrow through it: the result
    list underneath must not move. Escape closes the menu; Escape again closes
    the dialog.
  - At **375px**, signed in, with a topic filter set: all four controls fit, the
    close button is not clipped and the input is still usable. This is the
    `min-w-0` check and it is the one most likely to be missed, because it only
    appears once three controls share the row.
  - `curl -i http://localhost:5173/progress` while signed out → `401` with
    `cache-control: private, no-store`.
  - Switch to **file search** (the `FileSearch` button, or ⌘⇧F). Type a phrase,
    backspace one character and retype it: **no second `/api/search/files`
    request** for the repeated query, and the list must not blank between
    keystrokes. One request per settled query, and the visible results always
    match the current input.
  - Watch the panel through the **first** query of a session, while the 250 ms
    debounce is still running: it must read "Searching inside files…" and must
    never read "No files contain that phrase." before a response has landed. It
    has to be a _first_ query — once any list has landed the panel dims that list
    rather than emptying it, which is what hides this state from every subsequent
    keystroke. The pending marker covers the debounce, not only the fetch.
  - In file search, walk up to `MIN_DEEP_QUERY_LENGTH` (5) one character at a
    time: 4 characters must show "type at least 5 characters" and fire **no**
    request; 5 must search. `???` → an empty list, not an error. Try
    `"black hole"`, the unclosed `"black hol`, `foo OR bar`, `-NEAR(a b)` and
    `e=mc^2`. **None may 500.**
  - A **300-character paste** has an exact expected outcome rather than merely a
    survivable one: the panel says it is too long and names both
    `MAX_DEEP_QUERY_LENGTH` (200) and the query's own length, and **no request is
    sent**. Not "Couldn't search inside files." — that panel offers **Try again**,
    which re-fires the identical query and so could never succeed, which is why
    the limit is the client's as well as the server's.
  - Paste a **whole sentence copied out of a PDF the archive holds**, a dozen
    words, ligatures and all: that PDF must come back, and first. Extracted text
    has holes — one indexed file carries `figure` as `gure`, because the PDF emits
    U+0000 for the `fi` ligature and normalisation strips it with the other
    control characters — so ANDing every word of a real sentence matches nothing
    at all. The `OR` rung underneath is what recovers the file, and bm25's
    coverage ranking is what puts it on top. A long paste that finds nothing is
    this check failing.
  - Then a sentence whose words genuinely **are adjacent** in one document: it
    must return that one file, not a spread from several olympiads that merely
    share its words. That is the phrase rung, and a long query is meant to reach
    it. Backspace into the middle of the last word while it stands: the list must
    keep matching rather than blanking, which is the trailing `*`.
  - Switch to file search **with the box empty**, and clear the box after a
    search: both must show the explainer, never "Couldn't search inside files."
    See [search.md](./search.md#the-deepsearch-class) for why the sentinel is
    `null` rather than `''`.
  - A term that appears in a year-level PDF _and_ in a problem PDF gives two
    rows, one of them badged "Whole year". A term inside a PDF attached to
    several problems gives **one** row listing several problem numbers.
  - Enter opens the focused file in a new tab and **leaves the dialog open**;
    middle-click and ⌘-click work too. Switching back to problem mode restores
    the filters that were set before.
  - A PDF whose text contains `<script>alert(1)</script>` must render as text.
  - The same in **problem** mode, which is the mode that renders
    contributor-typed fields: give a problem a title holding
    `<img src=x onerror=alert(1)>`, then search for it — the tag must render as
    literal text, with `<mark>` still wrapping the part that matched. Every
    displayed field reaches the DOM through `{@html highlight(…)}`, a field does
    not have to match anything to be delivered, and `/api/search` sits in a shared
    cache for a day.

- **The extraction pipeline** — most of it runs under `bun run dev`, since
  nothing needs a binding the Worker does not already have:
  - Pick an **ordinary text PDF** in the year editor: the form must report the
    page count and the character count and say **searchable**, before the upload
    — not the amber "Couldn't read the text". That amber note is the whole of what
    a dead parser looks like from outside: the upload still succeeds, the row
    still lands `pending`, and nothing anywhere else says a word. One minute here
    is the difference between catching that and shipping it. When it _is_ a real
    failure the note carries the parser's own message in mono beside the friendly
    sentence, and `extractText` `console.error`s the thrown value, so the console
    is the second place to look. Submit → searchable immediately, row `ok`.
  - Pick a **scanned** PDF: the form says "no text found" _before_ the upload.
    Submit anyway → the upload succeeds and the row is `empty`, counted in the
    admin panel's Index tab.
  - Pick a `.zip` → "isn't searchable", upload succeeds, row `skipped`, no error.
  - **Disable JavaScript and upload** (or delete `static/vendor/pdfjs/` to
    simulate a 404): the upload must still succeed and the row must land
    `pending`, not `error`.
  - **Forge the field**: submit an `extractedText` containing U+0002/U+0003 and
    `<script>alert(1)</script>`, then search for a word in it — the sentinels are
    gone (no spurious highlight) and the tag renders as text.
  - Delete a file → it stops appearing, and **Prune orphans** reports the row.
    Delete and re-upload the same label → one row, with the new text.
  - **Rebuild index** → results unchanged. The index is disposable.

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

### Client-side state

Svelte 5 runes throughout. Four choices recur, and picking the wrong one has
caused real bugs, so they are worth stating rather than inferring:

| Use                              | When                                                                                                                                                                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `$state`                         | ordinary reactive cells that drive markup                                                                                                                                                                                                                                                |
| `$state.raw`                     | a collection **replaced wholesale and never mutated** that is read on a hot path. A deep proxy puts a trap on every element read; `index` and `progress` in the ⌘K dialog are read on every keystroke, so both are raw. It also makes an identity check exact rather than proxy-mediated |
| a plain `let`                    | a flag that **gates a fetch but drives no markup**. Making it reactive is not merely wasteful — if the effect that writes it also reads it, reactivity **loops**. `indexFetched`, `progressFetchedFor` and the olympiad page's `touched` are all plain                                   |
| a class in a `.svelte.ts` module | several cells that belong together and must **survive an unmount**. `Pending` in `$lib/forms.svelte.ts` and `DeepSearch` in the search folder are the two                                                                                                                                |

Two rules about effects, both learned the hard way:

- **Read every dependency synchronously, at the top.** Svelte registers only what
  the body reads synchronously, so anything read after an `await` or inside a
  `setTimeout` is _not_ a dependency — which is usually what you want. In the deep
  search effect it is load-bearing: if the fetch created a dependency, landing a
  response would re-trigger the request that produced it.
- **A teardown is a cancellation point.** The deep-search debounce _is_ the
  effect's teardown — `clearTimeout` plus `abort()`, no timer state and no wrapper
  — because the teardown runs immediately before every re-run. See
  [search.md](./search.md#the-debounce-is-the-effects-teardown).

Fetch-once guards are set **only on success**, so a failure retries on the next
open rather than leaving the session permanently broken — which is exactly why
each needs a second, in-flight flag beside it, or three quick ⌘K opens fire three
`/api/search` **and** three `/progress` requests before the first answers. Those
in-flight flags are plain `let`s for the reason in the table above, and
emphatically not the `$state` loading cells the markup reads: both guards are
called synchronously from an `$effect`, so a reactive one would make the effect
depend on what it writes and, on the failure path, refetch and fail again for as
long as the dialog stayed open. And an explicit
`res.ok` check is mandatory before `res.json()`: an error response with an HTML
body makes `json()` throw, which escapes as an unhandled rejection and leaves the
UI claiming there is no data rather than reporting a failure.

### Styling and theming

Tailwind v4, configured entirely in CSS — there is no `tailwind.config.js`.
[`src/app.css`](../src/app.css) is the entry point and holds the design tokens;
`src/styles/` holds `base.css`, `prose.css` and `theme.css`.

The palette is **Catppuccin** — Latte for light, Mocha for dark — written as
`oklch()` with the source hex in a trailing comment on every line. Keep that
comment when editing a token: it is the only trace of which Catppuccin colour a
value came from. Tokens are declared on `:root` and overridden under `.dark`, then
re-exported to Tailwind through `@theme inline`, so utilities like `bg-card` and
`text-muted-foreground` resolve in both themes with no `dark:` variant needed.
**Prefer a semantic token over a literal colour** for that reason.

Dark mode is [`mode-watcher`](https://github.com/svecosystem/mode-watcher) toggling
a `.dark` class on `<html>`, with `@custom-variant dark (&:where(.dark, .dark *))`
so the variant follows the class rather than the media query. `html` and
`html.dark` carry their own background, distinct from `--background`, so the page
behind the app has no flash of the wrong colour.

Three shared surface treatments are `@utility` rules rather than components, and
the file says why: **the same decoration is applied to structurally different
elements** — a `<nav>`, a `<div>`, a dialog panel — so a component would not fit.
Anything that repeats its _markup_ as well should be a component instead.

| Utility          | What it is                                                       |
| ---------------- | ---------------------------------------------------------------- |
| `glass`          | the frosted panel used by the nav pills and the landing stat bar |
| `glass-hairline` | the divider between rows inside a `glass` panel                  |
| `file-input`     | a bare `<input type="file">` styled to match the button language |

There is also a set of `data-*` custom variants (`data-open`, `data-closed`,
`data-checked`, `data-selected`, `data-disabled`, `data-active`,
`data-horizontal`, `data-vertical`) that normalise bits-ui's two spellings —
`[data-state='open']` and a bare `[data-open]` — into one. Use those rather than
matching either attribute directly.

Fonts are DM Sans and JetBrains Mono, self-hosted through `@fontsource-variable`.
**Mono is meaningful, not decorative**: it marks a year or a problem number.

Anything animated gets `motion-reduce:transition-none`.

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
