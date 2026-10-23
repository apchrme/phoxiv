# Testing

The end-to-end suite is [Playwright](https://playwright.dev/), in
[`tests/e2e/`](../tests/e2e). Its specs run against the production build in local
workerd, on a database that is migrated and seeded from empty on every run. They
never contact Cloudflare, GitHub or the CDN.

There are no unit tests. A spec drives the app the way a visitor or a forged
request would, so what it checks needs no manual click-through.
[contributing.md](./contributing.md#the-gates) lists the checks that stay manual.

## Running it

Install the browser once per machine:

```sh
bunx playwright install chromium
```

| Script                    | What it does                                                             |
| ------------------------- | ------------------------------------------------------------------------ |
| `bun run test:e2e`        | build, start the e2e server, run every spec, stop the server             |
| `bun run test:e2e:smoke`  | the same, but only specs tagged `@smoke`. The pre-commit gate            |
| `bun run test:e2e:ui`     | Playwright's UI mode, for writing and debugging a spec                   |
| `bun run test:e2e:server` | build and start the e2e server on its own, for `E2E_REUSE` (below)       |
| `bun run test:e2e:report` | open the HTML report of the last run, with a trace for every failed test |

The smoke subset is the HTTP-level specs plus the harness; it runs in well under
a minute after the build. Run the full suite before pushing.

Every script runs Playwright through its own Node entry point. Never add
`--bun`: Playwright supports only Node.

### Skipping the build, reusing the server

The build takes about 35 seconds. Two variables cut the loop while writing a
spec:

| Variable         | Effect                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `E2E_SKIP_BUILD` | serve the existing `.svelte-kit/cloudflare` build. Stale if you changed app code since     |
| `E2E_REUSE`      | use a server already listening on the e2e port instead of starting one. Its state persists |

```sh
E2E_SKIP_BUILD=1 bun run test:e2e
```

```powershell
# PowerShell has no inline env-var prefix, so the sh form above is a parse error there
$env:E2E_SKIP_BUILD = '1'; bun run test:e2e; Remove-Item Env:E2E_SKIP_BUILD
```

Unlike the sh prefix, `$env:` lasts for the rest of the terminal session, so the
PowerShell forms clear the variable afterwards. Left set, every later run in that
terminal, the commit gate included, would test a stale build. The server prints a
reminder on every run while `E2E_SKIP_BUILD` is set.

With `E2E_REUSE`, start the server once in another terminal
(`bun run test:e2e:server`), then run specs against it as often as you like:

```sh
E2E_REUSE=1 bunx playwright test tests/e2e/specs/http
```

```powershell
$env:E2E_REUSE = '1'; bunx playwright test tests/e2e/specs/http; Remove-Item Env:E2E_REUSE
```

A reused server keeps every write from earlier runs, so a spec that uses up a
fixture (see [Seed data](#seed-data)) fails the second time. Restart the server
to reset it. Before trusting a result, run once without either variable.

### Choosing what runs

- `--grep "<text>"` runs tests whose title or tag matches; `--grep-invert`
  excludes them.
- `--project desktop` runs one project. The `setup` project (the harness) always
  runs first, because every other project depends on it. `desktop` (Desktop
  Chrome) runs every spec except these, which run only in their own project so
  that each spec runs once: `specs/mobile/` in `mobile` (a Pixel 7, with touch,
  412px wide unless a spec sets a viewport), `specs/motion/` in `motion`
  (Desktop Chrome with animations on), and `admin/index-panel` in `index`, which
  waits for `desktop` to finish (see [Seed data](#seed-data)). If a `desktop`
  test fails, `index` is skipped.
- A spec file or directory path runs just that: `bunx playwright test
tests/e2e/specs/auth`.
- A failed test keeps its trace. `bun run test:e2e:report` opens it, or run
  `bunx playwright show-trace test-results/<test>/trace.zip`.

### Alongside `bun run dev` or `bun run preview`

`bun run dev` is unaffected: it uses its own port and `.wrangler/state`. But the
suite's build writes `.svelte-kit/cloudflare`, which `bun run preview` serves, and
a running `wrangler dev` reloads when that changes. Don't build for the suite
while a preview is up, or set `E2E_SKIP_BUILD` to reuse the preview's build.

### A stray `workerd`

If a run is killed hard, its `workerd` can outlive it. It keeps the e2e port and
holds `.wrangler/e2e` open, so the next run fails to start, or fails to wipe the
state with an error that says so. Stop it:

```sh
pkill workerd                 # macOS, Linux
taskkill /IM workerd.exe /F   # Windows
```

### A deep checkout path on Windows

workerd keeps the e2e database about 125 characters below the repo root
(`.wrangler/e2e/v3/d1/miniflare-D1DatabaseObject/<64-hex>.sqlite-wal`). Windows
caps a path at 259 characters, so with a root path longer than about 130
characters every migration fails with an unhelpful `internal error`, and git
can't delete the directory either. Keep the checkout, and any worktree, at a
short path.

## The e2e server

[`tests/e2e/server.ts`](../tests/e2e/server.ts) is Playwright's `webServer`. In
order, it:

1. builds the app with `bun run build`, unless `E2E_SKIP_BUILD` is set;
2. runs [`prepare.ts`](../tests/e2e/prepare.ts): deletes `.wrangler/e2e`, applies
   every migration with `wrangler d1 migrations apply`, then inserts the seed;
3. starts `wrangler dev --local` on that state, with `.env.test`.

Playwright waits for `/api/stats` to answer, runs the specs, and kills the
server's process tree at the end.

**The suite runs `wrangler dev`, not `vite dev`.** Only `wrangler dev` runs what
is deployed:

- the adapter's bundle, in real workerd;
- `caches.default`, which serves `/api/*` before the app runs (`vite dev` has no
  shared cache);
- SvelteKit's CSRF check, which `vite dev` skips;
- R2 uploads. Under `vite dev` a streamed `put()` fails
  ([workers-sdk#4373](https://github.com/cloudflare/workers-sdk/issues/4373)), so
  every upload spec would fail there.

**`--local-upstream` is required.** `wrangler.jsonc` routes the Worker to
`phoxiv.org`, so by default `wrangler dev` rewrites each request's URL, `Origin`
and `Referer` to `http://phoxiv.org`. BetterAuth then sees an untrusted origin and
answers every cookie-bearing POST to `/api/auth/*`, sign-out included, with
`403 Invalid origin`. Form actions still work, since SvelteKit sees the same
rewritten origin on both sides. `--local-upstream 127.0.0.1:<port>` keeps the
real origin. This is also why the developer `.env` trusts `http://phoxiv.org`:
`bun run preview` has no such flag.

**`getPlatformProxy` persists one directory deeper.** `wrangler dev
--persist-to .wrangler/e2e` and `wrangler d1 … --persist-to .wrangler/e2e` store
under `.wrangler/e2e/v3`, but `getPlatformProxy({ persist: { path } })` uses its
path as given. `prepare.ts` seeds through the proxy at `.wrangler/e2e/v3`
(`PROXY_PERSIST` in [`support/env.ts`](../tests/e2e/support/env.ts)). Point it
at `.wrangler/e2e` and the seed lands in a database the server never reads.

### The safety guards

The suite can never touch production data or the free-tier quotas. The flags are
the guarantee; the environment scrub is defence in depth, since a `wrangler
login` token lives in your user profile, beyond any environment variable.

- **Every wrangler call goes through
  [`support/wrangler.ts`](../tests/e2e/support/wrangler.ts).** As a child process,
  wrangler always gets `--local --persist-to .wrangler/e2e --env-file .env.test`,
  and the helper throws on `--remote`. `--env-file` matters for every command:
  without it wrangler loads your `.env` and `.env.local` into its own
  environment on startup.
- **The seed's in-process `getPlatformProxy` passes `remoteBindings: false`**
  (`localPlatformProxy()` in the same file). Never remove it: if a binding in
  `wrangler.jsonc` were ever marked `remote`, the seed would be written to
  production with your credentials.
- **The environment is scrubbed**, in the server process itself and in every
  child. `CLOUDFLARE_*` and `CF_*` are removed, so a token in your shell can't
  reach the account. `BETTER_AUTH_*`, `GITHUB_*` and every key in your `.env`
  are removed, because Bun autoloads `.env` and the Worker must see only
  `.env.test`. `CLOUDFLARE_CF_FETCH_ENABLED=false` stops Miniflare downloading
  `request.cf` data from Cloudflare.
- **`.env.test`'s origin must be loopback.** `support/env.ts` throws otherwise, so
  `baseURL` can't point at a deployed site.
- **Never set `NODE_ENV=test` or `TEST`.** Either one makes BetterAuth skip its
  origin check (`isTest()` in better-auth's `create-context`), so the suite would
  pass against a server laxer than production. The scrub removes both.
- **`prepare.ts` deletes `.wrangler/e2e` and nothing else.** The check is an
  exact match, so no edit can point it at `.wrangler/state`, which holds your
  own local database.
- **Every external request is aborted** by the `test` fixture, so no page in a
  spec loads anything from the CDN or GitHub. The harness checks that this works.

## The test environment

[`.env.test`](../.env.test) is the Worker's environment under test. wrangler
reads it through `--env-file`, which replaces `.env` and `.dev.vars` entirely, and
its values override `vars` in `wrangler.jsonc`. `support/env.ts` reads the same
file for the tests.

| Variable                       | Value and why                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `BETTER_AUTH_SECRET`           | a dummy. The tests sign session cookies with it                                      |
| `BETTER_AUTH_URL`              | `http://127.0.0.1:8799`. The only place the e2e port is written; everything reads it |
| `GITHUB_CLIENT_ID` / `_SECRET` | dummies. Nothing in the suite signs in through GitHub                                |
| `TRUSTED_ORIGINS`              | the same origin. Redundant: BetterAuth always trusts `BETTER_AUTH_URL`'s origin      |
| `SUPERADMIN_EMAIL`             | `USERS.superadmin`'s email, so the superadmin refusals can be tested                 |

It is committed on purpose: every value is a dummy that works only against the
local e2e server. Keep comments on their own lines. wrangler's
dotenv parser strips a trailing `# comment` and `support/env.ts` does not, so the
two would read different values.

## Seed data

[`fixtures/seed-data.ts`](../tests/e2e/fixtures/seed-data.ts) is everything the
database starts with. It is typed with `$inferInsert` from `schema.ts`, so a
schema change that breaks it fails `bun run check`.
[`fixtures/seed.ts`](../tests/e2e/fixtures/seed.ts) inserts it in foreign-key
order, in chunks that stay under D1's limit of 100 bound parameters per
statement. Seeded `file_text` rows fire the FTS5 triggers, so deep search works
on them as in production.

The schema always comes from the migrations, **never `db:push`**, because only
the migrations create the hand-written FTS5 table and its triggers
([data-model.md](./data-model.md#the-full-text-index)). So every run also proves
the migrations apply to an empty database.

Several workers share one database, so each row belongs to one class:

| Class    | Who writes it                                           | Examples                               |
| -------- | ------------------------------------------------------- | -------------------------------------- |
| frozen   | nobody. Any spec may read it                            | `alpha`, `USERS.admin`, `USERS.banned` |
| owned    | exactly one spec file, named in a comment on the row    | `USERS.stale` (http/cache-headers)     |
| per-test | the test that creates it, under an id unique to it      | an olympiad a contribute spec creates  |
| global   | only the index spec, in its own project, after the rest | the FTS5 index                         |

Rules that follow:

- **No spec writes a frozen row.** If a test must change something, seed a row
  it owns.
- **The index spec counts globally.** Prune orphans removes every `file_text`
  row with no file, and a file delete leaves its row orphaned between two D1
  statements. So `admin/index-panel` runs in the `index` project, after every
  `desktop` spec, and no other project may write `file_text`.
- **No other spec asserts a global total**, such as the number of olympiads.
  Another spec may have added rows, and `/api/stats` is shared-cached for the run
  anyway.
- **Some owned rows can be used only once**: a session due a refresh is
  refreshed by the first page request. That is why `retries` is 0; a retry would
  run against used-up state.

To add rows, add them to the right section of `seed-data.ts` with explicit ids
(seeded ids start at 1001, so rows the specs create get ids above them). Name
the owner of an owned row in a comment. Build urls with the R2 key layout,
`CDN_BASE_URL/olympiads/<id>/<year>[/<problem>]/<slug>.<ext>`: deep search's
olympiad filter is a range scan over that layout
([search.md](./search.md#the-olympiad-filter-a-url-range-not-a-join)).

Nothing is seeded into R2. The browser never loads an object (external requests
are aborted), deleting a missing object is a no-op, and under the proxy a
streamed `put()` would fail anyway. Specs that upload write to the e2e bucket
through the app.

The documents a spec uploads are in `fixtures/files/`: `text.pdf` (two pages,
holding `PHRASES.textPdf`) and `scanned.pdf` (one page that is only an image).
`.gitattributes` marks them so git never rewrites their line endings.

## Signing in without GitHub

Each seeded user has a session row. A test presents its token in the cookie
BetterAuth expects, signed the way BetterAuth signs it
([`support/auth.ts`](../tests/e2e/support/auth.ts)):

```
better-auth.session_token = encodeURIComponent(token + "." + base64(HMAC-SHA256(BETTER_AUTH_SECRET, token)))
```

On `https://phoxiv.org` the name gains a `__Secure-` prefix; the e2e origin is
http, so it doesn't. Nothing in the app changes for tests.

| Key              | Role                                             | Use                                                  | Owner                      |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------- | -------------------------- |
| `admin`          | admin                                            | the admin most specs act as; never a target          | frozen                     |
| `superadmin`     | admin, `SUPERADMIN_EMAIL`, no session            | a target the admin panel must refuse to modify       | frozen                     |
| `contributor`    | contributor, assigned `e2e-assigned`             | the contributor in the access-control matrix         | frozen                     |
| `user`           | none                                             | a plain signed-in visitor                            | frozen                     |
| `banned`         | contributor, `banned` set by hand, session kept  | must be treated as signed out everywhere             | frozen                     |
| `stale`          | none; the session is due a refresh               | the refreshed cookie must reach the browser          | http/cache-headers         |
| `apiTarget`      | none, no session                                 | the target of closed admin calls and a cancelled ban | auth/ban                   |
| `banTarget`      | contributor, assigned `e2e-assigned`             | banned through the admin panel                       | auth/ban                   |
| `unbanTarget`    | none, `banned` set by hand, session kept         | unbanned through the admin panel                     | auth/ban                   |
| `roleTarget`     | none                                             | promoted through the admin panel                     | admin/users                |
| `loopTarget`     | none, no session                                 | the role change in the submit-loop regression        | admin/users                |
| `tracker`        | none                                             | marks problems done                                  | olympiads/progress         |
| `assignTarget`   | contributor, assigned `alpha`                    | assigned other olympiads through the admin panel     | admin/users-table          |
| `progressReader` | none, with seeded progress on `alpha`            | what the status filter and year totals are read from | olympiads/progress-filters |
| `progressRacer`  | none                                             | tracks while its progress request is held            | olympiads/progress-filters |
| `searcher`       | none, with seeded progress (`SEARCHER_PROGRESS`) | what ⌘K's progress filter is read from               | search/problem-filters     |

`admin/users-table` also owns 30 filler accounts (`e2e-ut-filler-01` to `-30`),
which have no session and are not in `USERS`. They give the users table a second
page, and they joined after every `USERS` account, so the default sort keeps all
of `USERS` on page 1. Specs that find a row by scrolling page 1 rely on that, so
keep `USERS` under the page size of 25.

In a spec:

- `test.use({ role: 'admin' })` signs in the default `page`, `context` and
  `request` for every test in scope. The default is signed out.
- `as('contributor')` opens a page in a fresh context signed in as that user, for
  a second actor in one test. Use a fresh one after a sign-in, sign-out, ban or
  role change: `(reg)` pages are browser-cached for four hours.
- `apiAs('user')` is an API client signed in as that user, with its own cookie
  jar.

### When the canary fails

The `setup` project's first test signs in as `USERS.admin` and expects a
session. If it fails, every other project is skipped and its message lists the
causes, in order:

1. **The cookie name.** A `__Secure-` name means the Worker saw an https
   `BETTER_AUTH_URL`: `.env.test` didn't override `wrangler.jsonc`.
2. **The secret.** wrangler logs "Using secrets defined in .env.test" when it
   loads the file. A Playwright run hides the server's output, so start it with
   `bun run test:e2e:server` to see the line.
3. **The seed.** If "the sentinel olympiad exists" fails too, `prepare.ts`
   seeded a database the server doesn't read; check `PROXY_PERSIST`.
4. **The signing.** After a better-auth or better-call upgrade, compare
   `support/auth.ts` with better-call's `signCookieValue`. Its `getSignedCookie`
   accepts only a 44-character signature ending in `=`.

### Why not another way in

- **better-auth's `testUtils` plugin** would have to be added to `authOptions`,
  the configuration production runs. It is the fallback if signing ever becomes
  impractical.
- **Email and password sign-in** would add a sign-in path to production.
- **Impersonation** needs an admin session to start from, and the admin
  plugin's HTTP endpoints are closed ([auth.md](./auth.md#sessions)).

## Writing a spec

```
tests/e2e/
├── server.ts, prepare.ts   the e2e server
├── fixtures/
│   ├── seed-data.ts        every seeded row, USERS, PHRASES
│   ├── seed.ts             inserts it
│   └── files/              documents specs upload
├── support/
│   ├── env.ts              .env.test, the port, the state paths
│   ├── wrangler.ts         the only way to run wrangler
│   ├── auth.ts             the signed session cookie
│   ├── test.ts             `test` and `expect`: role, as(), apiAs(), the guards
│   ├── actions.ts          postAction()
│   ├── ui.ts               gotoReady(), toast(), holdAction(), confirmDialog(), pickOlympiad(), openSearch()
│   └── config.ts           the Playwright config (re-exported by the root file)
└── specs/<area>/*.spec.ts
```

Import `test` and `expect` from `support/test.ts`, never from `@playwright/test`.
That `test` aborts external requests and fails a test on any uncaught page error
(set `allowPageErrors` if one is expected).

### `postAction` vs the UI

Drive the UI when the behaviour is in the browser: a toast, a busy state, a
dialog, a client-side refusal. Use `postAction()` from
[`support/actions.ts`](../tests/e2e/support/actions.ts) for what the UI can't
send: a role that may not act, a field the form never submits, a value a client
check would block.

`postAction` sends what `use:enhance` sends (`x-sveltekit-action` and a matching
`Origin`) and takes the answer it must get:

```ts
await postAction(
	api,
	'/admin?/setRole',
	{ userId, role: 'admin' },
	{ error: 403, message: 'Unauthorised' }
);
```

**Every refusal names its message as well as its status.** A guard's `error()`
arrives as `{ type: 'error' }` with that HTTP status; `actionFail()` arrives as
`{ type: 'failure' }`, with its status both as the HTTP status and in the body,
and `postAction` checks both. A CSRF refusal is
not an action answer at all. Checking the message is what stops a 403 from the
wrong place passing for the right one. The access-control spec opens with a
positive control (an admin's forged self-`setRole` gets its 400), which proves
the harness can post at all.

### Selectors

In order of preference:

1. role and accessible name (`getByRole('button', { name: 'Save' })`);
2. label (`getByLabel`);
3. visible text;
4. a hook the app already has (`[data-result-index]`, `[data-sonner-toast]`);
5. a `data-testid`, added to the app with a comment saying a spec uses it.

Never select by a Tailwind class; they change with styling. If an icon-only
control has no accessible name, give it an `aria-label` in the app: that fixes
it for screen readers too.

bits-ui renders popovers, dropdowns, selects and dialogs in a portal at the end
of `<body>`, not inside the trigger. Locate them from `page`, not from the
trigger's container; the helpers in [`support/ui.ts`](../tests/e2e/support/ui.ts)
do. Open a page with `gotoReady()` before clicking anything: it waits for the
`data-hydrated` marker the root layout sets in `onMount`, because before
hydration an enhanced form submits natively and a bits-ui trigger does nothing.

Names that are easy to get wrong:

- **A bits-ui select's trigger is a `combobox`**, not a `button`, though the
  element is a `<button>`. It is named by its `aria-label` or else by the value
  it shows. Its options are `option`s.
- **A busy button is named "Loading &lt;label&gt;"**: `SubmitButton` and
  `ConfirmSubmit` swap their icon for a spinner with `role="status"` and
  `aria-label="Loading"`. A `SubmitButton` with a `busyLabel` swaps its label
  too, so "Save metadata" is "Loading Saving…" while busy. An exact-name query
  stops matching while it is busy.
- **Seeded names overlap.** `admin@e2e.test` is the tail of
  `superadmin@e2e.test`, and `ban-target@` of `unban-target@`. Pick a table row
  by an exact cell (`has: getByRole('cell', { name, exact: true })`), never by
  `hasText`.
- **Anchor label regexes.** `getByLabel('ID')` also matches "Icon image (optional
  — overrides emoji)".
- **Cards have no role.** Scope to one with `[data-slot="card"]`, the vendored
  Card's own attribute, filtered by its title.

### Other conventions

- **Import constants rather than copying them**: the cache headers from
  `src/lib/server/cache.ts`, `CDN_BASE_URL` from `src/lib/constants.ts`. Import
  only modules that import nothing through `#lib`; that alias doesn't resolve
  outside the app.
- **Numbers are printed raw**, with no thousands separators, so match `1234`,
  never `1,234`.
- **A regression spec cites the comment it guards** by file and phrase, not line
  number, so the two can be found from each other.
- **Tag fast HTTP-level specs `@smoke`.** The smoke run is the pre-commit gate,
  so keep it quick.

## Avoiding flakes

- **Only web-first assertions.** `await expect(locator).toBeVisible()` retries;
  `expect(await locator.isVisible()).toBe(true)` does not. Never wait a fixed
  time, with one exception: a loop regression shows only as requests that keep
  coming after the answer, so its spec waits one bounded second and then counts.
  That wait carries an `eslint-disable-next-line playwright/no-wait-for-timeout`
  citing the incident (`admin/users`, `admin/index-panel`).
- **A local action answers in milliseconds**, too fast to see the busy state in
  between. To assert one, hold the request until the assertion has passed:
  `holdAction()` in `support/ui.ts` does it with `page.route`.
- **`/api/*` is shared-cached for the whole run.** A response is stored on first
  request and served from `caches.default` after, so a write doesn't show in an
  `/api/*` body the run has already fetched. Check a write through an editor page
  (never cached), a URL the run hasn't fetched yet (a new olympiad id, a new
  query), or a request with `Cache-Control: no-cache`, which the adapter's worker
  treats as a cache bypass.
- **`(reg)` pages are browser-cached for four hours.** After a sign-in, sign-out,
  ban or role change, use a fresh context (`as()`). The `test` fixture's request
  interception happens to disable Chromium's HTTP cache, but don't rely on that.
- **Some fixtures are used up once.** See [Seed data](#seed-data).
- **Toasts disappear after four seconds.** Assert on one as soon as the action
  that raises it resolves.
- **Motion is reduced** (`reducedMotion: 'reduce'`), so the landing page's GSAP
  rows don't move and transitions don't delay clicks. The `motion` project is the
  exception: its specs check the animated paths still work, so they wait for
  what moves to stop (Playwright's click waits for a stable element) rather than
  for a time.
- **A request that must answer late** is held with `page.route` and released by
  the test. To serve a response computed before the page changes something, call
  `route.fetch()` at once and `route.fulfill()` on release
  (`olympiads/progress-filters`); a plain hold-then-continue would compute it
  after.
- **Tap a button again only once its last press has settled.** The shared
  button eases back from `active:translate-y-px`. While it moves, Playwright
  finds it unstable and retries the tap, scrolling the page on each retry, and
  bits-ui closes an open tooltip on scroll. Wait for `translate` to read `none`
  first (`mobile/sign-in-to-track`). Under load this failed about one run in
  three.
- **A debounce runs on Playwright's fake clock.** Install it before the page
  loads, and pause it only once the page is ready, so load and hydration run in
  real time. Then "during the debounce" lasts as long as the assertions need, and
  `page.clock.runFor()` ends it exactly (`search/files`).

## What the specs cover

`bunx playwright test --list` prints every test. By directory:

| Directory           | Covers                                                                                                                                                                                                  | Guards                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/smoke/`      | the harness: the canary, the signed-out redirect, the sentinel, loopback                                                                                                                                | this file                                                                                                                                                                                     |
| `specs/http/`       | every route's cache header, the legacy redirects, the `/api/*` shapes                                                                                                                                   | [architecture.md](./architecture.md#caching-and-the-route-tree), [deployment.md](./deployment.md#purging-the-cache-after-an-api-change), [search.md](./search.md#cost-controls-and-the-cache) |
| `specs/auth/`       | the role × route matrix, bans, BetterAuth's closed admin endpoints                                                                                                                                      | [auth.md](./auth.md#which-guard-each-route-uses)                                                                                                                                              |
| `specs/admin/`      | changing a role; the users table's paging and olympiad assignments; the Log tab's paging; the Index tab's counts and maintenance actions                                                                | the submit loops in `UserRowActions.svelte` and `IndexPanel.svelte`; the log's id cursor; [auth.md](./auth.md#the-admin-panel), [search.md](./search.md#operating-the-index)                  |
| `specs/contribute/` | creating an olympiad, the icon, the year editor's rows, topics, duplicates and links, uploads and their text extraction, deleting files and years, `titles.csv` export and import                       | the icon data loss, the `{#if}` row shift, rule 6 (`actionFail`); [data-model.md](./data-model.md#r2-key-layout), [search.md](./search.md#the-write-path)                                     |
| `specs/olympiads/`  | the index's order, search, tags and states; the olympiad page's 404 and what it must never render; tracking progress; the status filter, year totals and the stale-response guards                      | [data-model.md](./data-model.md#problem_progress)                                                                                                                                             |
| `specs/search/`     | the ⌘K dialog: reset, highlight, Enter, escaping, the session caches, filters before ranking, the keyboard, failures; files mode's states, debounce, ranking, results, length limit and olympiad filter | [search.md](./search.md#the-client)                                                                                                                                                           |
| `specs/pages/`      | the landing page's stats and corpus bands, the blog, the theme toggle; no request leaves the origin                                                                                                     | [architecture.md](./architecture.md)                                                                                                                                                          |
| `specs/mobile/`     | ⌘K at 375 and 390px, the mobile nav, the sign-in hint by tap (the `mobile` project)                                                                                                                     | the ⌘K controls fitting the row, the olympiad panel's `align="end"`, `SignInToTrack.svelte`'s tap                                                                                             |
| `specs/motion/`     | the landing page's reveals and the ⌘K dialog with animations on (the `motion` project)                                                                                                                  | `CorpusBand.svelte`'s hover pause                                                                                                                                                             |

## What stays manual

Some checks need a person: a real GitHub round trip, IME input, a real touch device,
contrast in dark mode, the bundle size. They are listed in
[contributing.md](./contributing.md#the-gates).

## CI

[`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml) runs on every pull
request, every push to `master`, and on demand. It runs `bun run lint`,
`bun run check` and `bun run test:e2e`, which builds first, on Ubuntu with Bun
and Node 24 (wrangler and Playwright run under Node). It installs Chromium with
its system libraries and caches the download under a key from `bun.lock`.

- **It holds no secrets.** The suite runs on local workerd state and
  `.env.test`'s dummy values, so the job needs no Cloudflare token and uses none
  of the free-tier quotas. Keep it that way (CLAUDE.md rule 10).
- **`CI` changes three settings** in `support/config.ts`: one worker instead of
  two, `forbidOnly` (a committed `test.only` fails the run), and the `github`
  reporter, which annotates failures on the pull request.
- **A failure uploads the evidence.** The `playwright-report` artifact holds the
  HTML report and `test-results/`, with a trace for every failed test, for 14
  days. Open it with `bunx playwright show-report <folder>`, or one trace with
  `bunx playwright show-trace <trace.zip>`.
- A newer push to the same branch cancels a run still in progress, and a run
  times out after 20 minutes.

## Keeping the suite current

| When you change…                      | Also update…                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `schema.ts`                           | `fixtures/seed-data.ts`, until `bun run check` passes                           |
| a route, an action or a guard         | its row in `specs/auth/access-control.spec.ts`, and in auth.md's guards table   |
| a route's cache header                | its row in `specs/http/cache-headers.spec.ts`                                   |
| an `/api/*` shape                     | `specs/http/api-contract.spec.ts`, and purge the cache after deploying (rule 9) |
| a user-visible string                 | the specs that match it (search `tests/e2e` for the old text)                   |
| a bug fix                             | a regression spec that fails without the fix                                    |
| a manual check that a spec now covers | delete it from [contributing.md](./contributing.md#the-gates)                   |
