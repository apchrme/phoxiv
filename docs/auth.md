# Authentication and authorisation

Authentication is [BetterAuth](https://better-auth.com/) with GitHub as the only
provider, plus BetterAuth's `admin` plugin. Authorisation (who may edit what) is
ours, in [`$lib/server/guard.ts`](../src/lib/server/guard.ts).

## Why `createAuth` is a function

[`$lib/server/auth.ts`](../src/lib/server/auth.ts) exports a function, not an
instance:

```ts
export function createAuth(database, env) {
	return betterAuth(authOptions(database, env));
}
```

The D1 binding and the secrets come from `platform.env`, which exists only
inside a Worker request. [`hooks.server.ts`](../src/hooks.server.ts) builds one
instance per request and puts it on `locals.auth`.
`api/auth/[...all]/+server.ts` forwards to `locals.auth.handler`. Don't use
BetterAuth's `toSvelteKitHandler(auth)`: it needs a module-level instance, which
a Worker cannot have.

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

| Option                  | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `secret`                | `BETTER_AUTH_SECRET`                                             |
| `trustedOrigins`        | `TRUSTED_ORIGINS`, comma-split; `[]` if unset                    |
| `database`              | `drizzleAdapter` over the four auth tables, `provider: 'sqlite'` |
| `socialProviders`       | `github` only; there is no email/password sign-in                |
| `user.additionalFields` | `assignedOlympiads`, with `input: false`                         |
| `plugins`               | `admin({ adminRoles: ['admin'] })`                               |

- No session lifetime is configured; BetterAuth's defaults apply.
- Sign-out is BetterAuth's own endpoint, called through `$lib/auth-client.ts`.
- The session cookie is named `__Secure-better-auth.session_token` on
  `https://phoxiv.org` and `better-auth.session_token` on localhost. A token is
  valid only for the origin that issued it. The backfill script sends the token
  under both names and checks `/api/auth/get-session` before doing any work, so a
  wrong token is reported clearly — see
  [deployment.md](./deployment.md#backfilling-the-text-index).
- `api/auth/[...all]` is the only `/api/` route that reads a cookie. It must
  never get cache headers.

## How an account is identified

BetterAuth (1.7+) identifies an external account by `(issuer, account_id)`, with
a unique index. `account.issuer` is therefore required. Without it, the GitHub
round trip succeeds but no session is created:

```
The field "issuer" does not exist in the schema for the model "account".
```

GitHub has no issuer, so BetterAuth writes `local:oauth:github`. See
[data-model.md](./data-model.md#auth-tables). If a BetterAuth upgrade breaks
login, compare `@better-auth/core/dist/db/get-tables.mjs` with `schema.ts`
first.

## The three roles

| Role          | Stored `role`      | May do                                              |
| ------------- | ------------------ | --------------------------------------------------- |
| `user`        | `null` or `'user'` | read everything public                              |
| `contributor` | `'contributor'`    | edit only the olympiads in `assignedOlympiads`      |
| `admin`       | `'admin'`          | edit every olympiad, create olympiads, manage users |

- `contributor` exists only in our app. The plugin is pinned to
  `adminRoles: ['admin']`, so BetterAuth's privileged operations (ban,
  impersonate, setRole) are admin-only. BetterAuth knows nothing about
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
| `banUser`              | sets `banned` and a reason                                       | target is you or a superadmin               |
| `unbanUser`            | clears them                                                      | target is a superadmin                      |
| `ensureIndex`          | re-runs the FTS5 DDL, then `'rebuild'`                           | —                                           |
| `optimizeIndex`        | `('merge', 500)` on the text index                               | —                                           |
| `pruneIndex`           | drops `file_text` rows with no owning file                       | —                                           |

- An admin cannot change their own role, assignments or ban status, so the last
  admin can't lock everyone out. `unbanUser` needs no self-check, since you can't
  ban yourself.
- Every account action checks the superadmin, including `unbanUser`.
- The index actions target no account. See
  [search.md](./search.md#operating-the-index).

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
| `requireContributor(locals)`        | 303 to `/login` if signed out; 403 unless admin or contributor |
| `requireOlympiadEditor(locals, id)` | 403 unless admin, or a contributor assigned to `id`            |

`requireContributor` redirects anonymous visitors because signing in is what they
need to do. The predicates behind the guards, `canEditOlympiad(user, id)` and
`getAssignedOlympiadIds(user)`, accept any `{ role?, assignedOlympiads? }`, so a
plain DB row works too.

### Which guard each route uses

| Route                                                                  | Guard                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `admin/+layout.server.ts`, the page load, all seven actions            | `requireAdmin`                                        |
| `admin/reindex` (`GET`, `POST`), `admin/index-stats`, `admin/activity` | `requireAdmin`, called by the endpoint itself         |
| `contribute/+layout.server.ts`                                         | `requireContributor`                                  |
| `contribute` — `selectYear`                                            | `canEditOlympiad` on the submitted olympiad id        |
| `contribute` — `createOlympiad`                                        | `requireAdmin`                                        |
| `contribute/[olympiad]` and `[year]` — loads and actions               | `requireOlympiadEditor`                               |
| `contribute/[olympiad]/titles.csv`                                     | `requireOlympiadEditor`                               |
| `(reg)/login`, `(reg)/profile`                                         | redirect to `/profile` if signed in / `/login` if not |
| `(reg)/olympiads/[olympiad]` — `?/trackProblem`                        | plain `locals.user` check                             |
| `(reg)/olympiads/[olympiad]/progress`, `progress/`                     | 401 when signed out                                   |
| `/api/*` and everything else                                           | public                                                |

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
  `?/trackProblem` checks only `locals.user`. It validates a score against the
  `max_score` in the database, never a value from the browser.
- **The progress endpoints set `private, no-store` before the 401**, so a
  signed-out response isn't cached either.

## The client side

[`$lib/auth-client.ts`](../src/lib/auth-client.ts) is a `createAuthClient` with
the `adminClient` plugin, used for sign-in and sign-out. Components get the user
as `data.user` from the root
[`+layout.server.ts`](../src/routes/+layout.server.ts). It drives the avatar, the
sign-in button, and whether `secondaryNavFor()` adds the admin link.

Nothing on the client is a permission check. Hiding the admin link is a
courtesy; `requireAdmin` is the control.
