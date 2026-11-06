# Authentication and authorisation

Authentication is [BetterAuth](https://better-auth.com/) with two OAuth
providers, GitHub and Google, plus BetterAuth's `admin` plugin. Signing in with
either under the same verified email leads to the same user (see
[Account linking](#account-linking)). Authorisation (who may edit what) is
ours, in [`#lib/server/guard.ts`](../src/lib/server/guard.ts).

## Why `createAuth` is a function

[`#lib/server/auth.ts`](../src/lib/server/auth.ts) exports a function, not an
instance:

```ts
export function createAuth(database, env) {
	return betterAuth(authOptions(database, env));
}
```

The D1 binding and the secrets come from `env` (`cloudflare:workers`), which
must not be read at module scope (see
[architecture.md](./architecture.md#request-lifecycle)).
[`hooks.server.ts`](../src/hooks.server.ts) builds one instance per request and
puts it on `locals.auth`. `api/auth/[...all]/+server.ts` forwards to
`locals.auth.handler`. Don't use BetterAuth's `toSvelteKitHandler(auth)`: it
needs a module-level instance.

### The CLI escape hatch

`bun run db:generate-auth` runs BetterAuth's schema generator, which must import
a static instance. [`auth-cli.ts`](../src/lib/server/auth-cli.ts) provides one:

```ts
export const auth = betterAuth(authOptions(cfenv.DB, process.env));
```

It wraps the same `authOptions` as `createAuth`, so the generated schema always
matches the running configuration. Keep one `authOptions`; never fork it. App
code never imports `auth-cli.ts`.

### Why `authOptions` uses `satisfies`

```ts
export function authOptions(database, env) {
	return { … } satisfies BetterAuthOptions;   // NOT `: BetterAuthOptions`
}
```

BetterAuth derives the session's user type from the literal options type. A
`: BetterAuthOptions` annotation widens it and strips `role`, `banned` and
`assignedOlympiads` from `locals.user`.

[`src/app.d.ts`](../src/app.d.ts) derives the user type from the auth instance
(`getSession`'s return type), not from the Drizzle table. BetterAuth returns
`undefined` for absent optional columns where Drizzle promises `null`, so the
Drizzle model does not match.

## Configuration

This is all of `authOptions`. Everything else is BetterAuth's default.

| Option                   | Value                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| `secret`                 | `BETTER_AUTH_SECRET`                                             |
| `trustedOrigins`         | `TRUSTED_ORIGINS`, comma-split; `[]` if unset                    |
| `database`               | `drizzleAdapter` over the four auth tables, `provider: 'sqlite'` |
| `socialProviders`        | `github`, and `google` with `prompt: 'select_account'`           |
| `account.accountLinking` | `enabled: true`, `disableImplicitLinking: false` (the defaults)  |
| `user.additionalFields`  | `assignedOlympiads`, with `input: false`                         |
| `plugins`                | `admin({ adminRoles: ['admin'] })`                               |

- There is no email/password sign-in.
- Google asks which Google account to use every time (`select_account`).
  Otherwise it reuses the browser's current one silently, and someone signed
  into the wrong account has no way to switch.
- No session lifetime is configured; BetterAuth's defaults apply. See
  [Sessions](#sessions).
- Sign-out is BetterAuth's own endpoint, called through `#lib/auth-client.ts`.
- The session cookie is named `__Secure-better-auth.session_token` on
  `https://phoxiv.org` and `better-auth.session_token` on localhost. A token is
  valid only for the origin that issued it. The backfill script sends the token
  under both names and checks `/api/auth/get-session` before doing any work, so a
  wrong token is reported clearly — see
  [deployment.md](./deployment.md#backfilling-the-text-index). The e2e suite
  signs this cookie itself for its seeded sessions, and its canary fails first
  if the name or signing ever drifts
  ([testing.md](./testing.md#signing-in-without-a-provider)).
- `api/auth/[...all]` is the only `/api/` route that reads a cookie. It must
  never get cache headers.

## Sessions

A session lasts seven days, and BetterAuth extends it to seven days again on
the first lookup after it turns a day old (`expiresIn` and `updateAge`, both
defaults). Signed-in visitors therefore stay signed in as long as they come
back within a week.

[`hooks.server.ts`](../src/hooks.server.ts) makes the one lookup per request,
with three rules:

- **It forwards the refreshed cookie.** When a session is extended, BetterAuth
  also re-issues the cookie with a new max-age. Called from server code it only
  hands that `Set-Cookie` back when asked (`returnHeaders: true`), so the hook
  asks and appends it to the response. Without this, the database row was
  extended but the cookie still expired seven days after sign-in.
- **It skips `/api/*`.** Those responses are shared-cached, so they must never
  depend on the user or carry `Set-Cookie`. `locals.user` is always `null`
  there. `/api/auth/*` reads its cookie through `locals.auth.handler` instead.
- **A banned user is signed out.** BetterAuth checks `banned` only when it
  creates a session, not when it reads one. `banUser` deletes the user's
  sessions, and the hook ignores any session whose user is banned, which covers
  bans set by hand in SQL.

`/api/auth/*` skips the hook's lookup, so
[`api/auth/[...all]/+server.ts`](../src/routes/api/auth/[...all]/+server.ts)
applies two rules of its own before handing the request to BetterAuth:

- **A banned user is signed out there too.** If the session's user is banned, the
  session cookies are removed from the request, so `get-session` answers `null`
  and `update-user` refuses. Only the session cookies go, so an OAuth `state`
  cookie survives a sign-in attempt. The check reads the session with
  `disableRefresh`, because a refresh there would extend the session in the
  database while its new cookie was thrown away.
- **`/api/auth/admin/*` is closed** with a 404. The admin plugin serves
  `set-role`, `ban-user`, `impersonate-user` and more over HTTP, and an admin's
  cookie reaches them, but they skip the admin panel's rules: the superadmin,
  the self-protection and the accepted roles. Through `set-role` an admin could
  demote the superadmin. The app never calls them; every admin action is a form
  action. The match is on the path prefix, not BetterAuth's `disabledPaths`,
  which takes exact paths only and would leave an endpoint a plugin upgrade
  added open. The plugin itself stays: it provides `role`, `banned` and the
  sign-in ban check.

## How an account is identified

A **user** is a person: one `user` row, which holds the role, the assignments,
the uploads and the progress. An **account** is one way of signing in as them:
one `account` row per provider, keyed by `(provider_id, account_id)` with a
unique index, where `account_id` is the provider's own id for the person.
BetterAuth refuses a sign-in when two rows match one key, and the index stops a
duplicate being written in the first place.

BetterAuth 1.7.0–1.7.2 keyed accounts on an `issuer` column instead, and 1.7.3
went back to `(provider_id, account_id)` and stopped writing `issuer`. The
column is gone: left in place, its `'local:oauth:github'` default would have
labelled every Google account as GitHub. See
[data-model.md](./data-model.md#auth-tables). If a BetterAuth upgrade breaks
login, compare `@better-auth/core/dist/db/get-tables.mjs` with `schema.ts`
first.

## Account linking

When someone signs in with a provider that has no `account` row for them yet,
BetterAuth looks for a user with the same email. If one exists, it **links**:
it adds an `account` row to that user and signs them in as them. Otherwise it
creates a new user. This is _implicit_ linking, on by default and spelled out
in `authOptions` so the rule is visible. Nobody has to link accounts by hand,
and a contributor who signs in with Google keeps their role, assignments and
upload credit from GitHub.

It links only when **both** sides vouch for the email:

- **The new provider says it is verified.** Google sends `email_verified` in its
  id token. GitHub reports the `verified` flag of the email it returns.
- **The existing user's email is verified** (`user.email_verified`), which
  BetterAuth's `requireLocalEmailVerified` (default `true`) enforces. The flag
  comes from whichever provider created the user. If that provider reported it
  unverified, it turns true the next time the user signs in there with the
  email verified; until then, a second provider can't link.

Never add `trustedProviders` or set `requireLocalEmailVerified: false`. Either
one drops a check, so whoever registers an unverified copy of someone's email
at one provider could have that person's account at the other linked into
their user.

When a check fails, BetterAuth refuses the sign-in with `account_not_linked`
rather than creating a second user under the same email. `user.email` is
unique, so a second user could not exist anyway. The login page passes
itself as `errorCallbackURL`, so the visitor lands back there, `?redirect=`
kept, with a message from `signInErrorMessage()` in
[`#lib/auth-providers.ts`](../src/lib/auth-providers.ts), not on BetterAuth's
bare error page.

- Linking keeps the user's name and avatar. BetterAuth copies the new
  provider's profile only with `updateUserInfoOnLink`, which is off.
- Linking matches on email only. An account at a provider under a different
  email is a different user.
- There is no unlink UI. `/profile` lists the linked providers, read from
  `account`.

## The three roles

| Role          | Stored `role`      | May do                                                         |
| ------------- | ------------------ | -------------------------------------------------------------- |
| `user`        | `null` or `'user'` | read everything public                                         |
| `contributor` | `'contributor'`    | edit only the olympiads in `assignedOlympiads`                 |
| `admin`       | `'admin'`          | edit every olympiad, create olympiads, manage users and badges |

- `contributor` exists only in our app. The plugin is pinned to
  `adminRoles: ['admin']`, so BetterAuth's privileged operations (ban,
  impersonate, setRole) would be admin-only, and their HTTP endpoints are closed
  anyway (see [Sessions](#sessions)). BetterAuth knows nothing about
  contributors; every contributor check is in `guard.ts`.
- `user.assigned_olympiads` is a JSON array of olympiad ids. `input: false`
  blocks writes through BetterAuth's update-user endpoint; only the admin panel
  writes it, through Drizzle.

## The admin panel

Seven form actions, each calling `requireAdmin`. The account actions write
Drizzle updates directly.

| Action                 | Effect                                                           | Refuses when                                |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `setRole`              | sets `role` (`user`, `contributor`, `admin`, or `''` for `null`) | target is you or a superadmin; unknown role |
| `setAssignedOlympiads` | rewrites `assigned_olympiads`                                    | target is you or a superadmin               |
| `banUser`              | sets `banned` and a reason; deletes the user's sessions          | target is you or a superadmin               |
| `unbanUser`            | clears them                                                      | target is a superadmin                      |
| `ensureIndex`          | re-runs the FTS5 DDL, then `'rebuild'`                           | —                                           |
| `optimizeIndex`        | `('merge', 500)` on the text index                               | —                                           |
| `pruneIndex`           | drops `file_text` rows with no owning file                       | —                                           |

- An admin cannot change their own role, assignments or ban status, so the last
  admin can't lock everyone out. `unbanUser` needs no self-check, since you can't
  ban yourself.
- Every account action checks the superadmin, including `unbanUser`.
- `banUser` deletes the user's sessions, as BetterAuth's own ban endpoint does.
  A flag alone is not enough: BetterAuth reads `banned` only when creating a
  session, so a banned contributor kept editing until their cookie expired. The
  hook ignores a banned user's sessions too (see [Sessions](#sessions)).
- Role and assignment changes take effect on the user's next request, because
  the hook reads the user row fresh each time; nothing is cached in the cookie.
- The index actions target no account. See
  [search.md](./search.md#operating-the-index).

Badges are edited on their own page, `/admin/badges/[id]` (`new` creates one),
under the same layout guard. Its two actions, `save` and `delete`, each call
`requireAdmin` themselves and log to `activity_log`. Saving re-evaluates the
badge for every user ([data-model.md](./data-model.md#badges-badges-badge_problems-user_badges)).

## The superadmin

A superadmin is an admin the panel cannot demote, reassign, ban or unban.
`isProtectedSuperadmin()` compares the target's email with `SUPERADMIN_EMAIL`.
It uses email because the variable is set before the account exists. If the
variable is unset it returns `false` and there is no superadmin, so a
self-hosted instance need not name one. It is not a role and is not stored.

## The guards

All in `guard.ts`. Each returns `{ db, user }` with a non-nullable `user`, ready
for `logActivity` ([data-model.md](./data-model.md#activity_log)).

| Guard                               | Behaviour                                                      |
| ----------------------------------- | -------------------------------------------------------------- |
| `requireAdmin(locals)`              | 403 unless `role === 'admin'`                                  |
| `requireContributor(locals, url)`   | 303 to `/login` if signed out; 403 unless admin or contributor |
| `requireOlympiadEditor(locals, id)` | 403 unless admin, or a contributor assigned to `id`            |

`requireContributor` redirects anonymous visitors because signing in is what they
need to do. It passes the page along as `/login?redirect=<path>`, and the login
page hands that to BetterAuth as the `callbackURL`, which BetterAuth checks
against the trusted origins. The predicates behind the guards, `canEditOlympiad(user, id)` and
`getAssignedOlympiadIds(user)`, accept any `{ role?, assignedOlympiads? }`, so a
plain DB row works too.

### Which guard each route uses

| Route                                                                  | Guard                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `admin/+layout.server.ts`, the page load, all seven actions            | `requireAdmin`                                          |
| `admin/reindex` (`GET`, `POST`), `admin/index-stats`, `admin/activity` | `requireAdmin`, called by the endpoint itself           |
| `admin/badges/[id]` — the load, `save` and `delete`                    | `requireAdmin` (the layout's, and each action's own)    |
| `contribute/+layout.server.ts`                                         | `requireContributor`                                    |
| `contribute` — `selectYear`                                            | `canEditOlympiad` on the submitted olympiad id          |
| `contribute` — `createOlympiad`                                        | `requireAdmin`                                          |
| `contribute/[olympiad]` and `[year]` — loads and actions               | `requireOlympiadEditor`                                 |
| `contribute/[olympiad]/titles.csv`                                     | `requireOlympiadEditor`                                 |
| `(reg)/login`, `(reg)/profile`                                         | redirect to `/` if signed in / `/login` if not          |
| `/`                                                                    | none: the dashboard if signed in, else the landing page |
| `(reg)/olympiads/[olympiad]` — `?/trackProblem`                        | plain `locals.user` check                               |
| `(reg)/olympiads/[olympiad]/progress`, `progress/`, `progress/badges`  | 401 when signed out                                     |
| `/api/*` and everything else                                           | public                                                  |

[`tests/e2e/specs/auth/access-control.spec.ts`](../tests/e2e/specs/auth/access-control.spec.ts)
mirrors this table row by row. Every refusal is checked for each role that must
be refused, actions included: no layout load runs for a form action, so the
action's own guard is the only check. Roles that may pass are checked with reads
only; the editor specs cover their writes. Change the table and the spec
together.

Rules:

- **A `+server.ts` runs no layout loads.** `admin/+layout.server.ts` does not
  protect `reindex/`, `index-stats/` or `activity/`, and the contribute layout
  does not protect `titles.csv`. Each calls its guard itself. Any new endpoint
  under `admin/` or `contribute/` must do the same.
- **The layout guard is never the only check.** The contribute layout only says
  the user may enter the area. Every load and action re-checks the olympiad with
  `requireOlympiadEditor`, so a contributor can't edit another olympiad by URL.
  `selectYear` takes the id from the form, so it checks `canEditOlympiad` itself.
- **Tracking is not editing.** Any signed-in user may track any problem, so
  `?/trackProblem` checks only `locals.user`. It also re-evaluates that user's
  badges, and only theirs. It validates a score against the
  `max_score` in the database, never a value from the browser.
- **The progress endpoints set `private, no-store` before the 401**, so a
  signed-out response isn't cached either.
- **Credit is public; the account is not.** `/team` and each olympiad's
  contributors list show admins' and contributors' display names, avatars and
  upload counts, from shared-cached `/api/*` endpoints. Those return only those
  three fields (and the role, on `/team`), never the email or the user id, and
  leave banned accounts out. The privacy policy says so; change both together.
  Badges follow the same rule: `/api/badges` gives each badge's holder count,
  never who holds it.
- **A hidden badge requirement is for admins and holders only.** The admin
  panel and the badge editor always show it. A user sees it only for a badge
  they hold, through the per-user `/progress/badges` and the dashboard, never
  through the shared-cached `/api/badges`. Everywhere else the criteria and the
  progress count are nulled on the server
  ([data-model.md](./data-model.md#badges-badges-badge_problems-user_badges)).

## The client side

[`#lib/auth-client.ts`](../src/lib/auth-client.ts) is a plain `createAuthClient`,
used only for sign-in and sign-out. It has no `adminClient` plugin: the admin
panel acts through form actions, never `authClient.admin.*`.

The login page offers one button per entry in
[`#lib/auth-providers.ts`](../src/lib/auth-providers.ts). Adding a provider
takes a `socialProviders` entry in `auth.ts`, an entry in `auth-providers.ts`, a
mark in `ProviderMark.svelte`, and its two secrets.

Components get the user
as `data.user` from the root
[`+layout.server.ts`](../src/routes/+layout.server.ts). It drives the avatar, the
sign-in button, and whether `secondaryNavFor()` adds the admin link.

Nothing on the client is a permission check. Hiding the admin link is a
courtesy; `requireAdmin` is the control.
