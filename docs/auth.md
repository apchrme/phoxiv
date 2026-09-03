# Authentication and authorisation

Authentication is [BetterAuth](https://better-auth.com/) with GitHub as the only
social provider, plus BetterAuth's `admin` plugin. Authorisation — who may edit
what — is ours, in [`$lib/server/guard.ts`](../src/lib/server/guard.ts).

## Why `createAuth` is a function

[`$lib/server/auth.ts`](../src/lib/server/auth.ts) exports a _function_, not a
configured instance:

```ts
export function createAuth(database, env) {
	return betterAuth(authOptions(database, env));
}
```

The D1 binding and the secrets both come from `platform.env`, which only exists
inside a Worker request. A module-level `betterAuth({ … })` would have to read
them at import time, when there is no request and no bindings.
[`hooks.server.ts`](../src/hooks.server.ts) therefore builds one instance per
request and hangs it on `locals.auth`. This is the real Cloudflare accommodation
in the auth layer — `api/auth/[...all]/+server.ts` itself is ten lines that
forward to `locals.auth.handler`. BetterAuth's own SvelteKit helper cannot be
used for the same reason: `toSvelteKitHandler(auth)` closes over a module-level
instance, which is precisely what a Worker cannot have.
[Background reading.](https://medium.com/@dasfacc/sveltekit-better-auth-using-cloudflare-d1-and-drizzle-91d9d9a6d0b4)

### The CLI escape hatch

`bun run db:generate-auth` runs BetterAuth's schema generator, which needs to
`import` the configuration statically — exactly what `createAuth` cannot offer.
[`auth-cli.ts`](../src/lib/server/auth-cli.ts) closes the gap:

```ts
export const auth = betterAuth(authOptions(cfenv.DB, process.env));
```

It wraps the **same** `authOptions` with a build-time D1 handle from
`cloudflare:workers` and `process.env`, so the generated schema always matches
the running configuration. Application code never imports it.

That shared `authOptions` is the only reason there is one configuration rather
than two, and keeping it that way is the point.

### Why `authOptions` uses `satisfies`

```ts
export function authOptions(database, env) {
	return { … } satisfies BetterAuthOptions;   // NOT `: BetterAuthOptions`
}
```

BetterAuth derives the session's user shape from the **literal** type of the
options object. Annotating the return type as `BetterAuthOptions` widens it, and
the widening strips `role`, `banned` and `assignedOlympiads` straight off
`locals.user`. `satisfies` type-checks the object against the interface while
preserving the literal, so `App.Locals['user']` — declared in
[`src/app.d.ts`](../src/app.d.ts) as
`NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>['user']` — keeps
those fields.

`app.d.ts` derives the user type from the auth instance rather than from the
Drizzle table for a related reason: BetterAuth returns `undefined` for absent
optional columns where Drizzle's `InferSelectModel` promises `null`, so the
Drizzle model is not assignable to what `getSession` actually hands back.

## What is configured, and what is left at its default

`authOptions` is short, and the shortness is worth reading as a statement: **the
list below is the whole of it.** Anything not here is BetterAuth's default, so
there is no third place to look.

| Option                  | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `secret`                | `BETTER_AUTH_SECRET`                                             |
| `trustedOrigins`        | `TRUSTED_ORIGINS`, comma-split; `[]` if unset                    |
| `database`              | `drizzleAdapter` over the four auth tables, `provider: 'sqlite'` |
| `socialProviders`       | `github` only — there is no email/password path at all           |
| `user.additionalFields` | `assignedOlympiads`, with `input: false`                         |
| `plugins`               | `admin({ adminRoles: ['admin'] })`                               |

**No session lifetime is configured**, so BetterAuth's own defaults govern
expiry and refresh. Do not go looking for a constant; there isn't one. Sign-out is
BetterAuth's own endpoint, reached through `$lib/auth-client.ts`, and the
`session` row cascades away with the user.

**The session cookie's name differs between environments**, which catches people
out well beyond auth itself. BetterAuth prefixes it with `__Secure-` whenever it
believes it is in production:

| Origin                  | Cookie                               |
| ----------------------- | ------------------------------------ |
| `https://phoxiv.org`    | `__Secure-better-auth.session_token` |
| `http://localhost:5173` | `better-auth.session_token`          |

A token is only valid for the origin that issued it, so a localhost session means
nothing to `phoxiv.org`. This is the trap behind the backfill script's
`PHOXIV_SESSION`, where a wrongly-named cookie fails **in a way that looks like a
permission problem** — the Worker sees no session at all and `requireAdmin`
answers with the same 403 it gives a signed-in non-admin. See
[deployment.md](./deployment.md#backfilling-the-text-index).

`api/auth/[...all]` is the only route under `/api/` that reads a cookie, and it
**must never be given cache headers**: it carries `Set-Cookie` and session state.

## How an account is identified

BetterAuth 1.7 changed the identity of an external account. Where 1.6 matched on
`(provider_id, account_id)`, 1.7 matches on **(`issuer`, `account_id`)** and
enforces that pair with a unique index. `account.issuer` is therefore a required
column, and the GitHub callback fails outright without it:

```
The field "issuer" does not exist in the schema for the model "account".
```

That error surfaces as a login that never completes — the OAuth round trip
succeeds, then `findAccountOwnerByKey` throws before a session is created. If a
BetterAuth upgrade ever breaks login again, check the canonical table definition
in `@better-auth/core/dist/db/get-tables.mjs` against `schema.ts` first; that is
where the required columns actually live.

GitHub declares no issuer of its own, so BetterAuth writes the synthetic
`local:oauth:github`. See
[data-model.md](./data-model.md#auth-tables) for the column and why it carries a
default.

## The three roles

| Role          | Stored as                    | May do                                                    |
| ------------- | ---------------------------- | --------------------------------------------------------- |
| `user`        | `role` is `null` or `'user'` | read everything public; nothing else                      |
| `contributor` | `'contributor'`              | edit **only** the olympiads listed in `assignedOlympiads` |
| `admin`       | `'admin'`                    | edit every olympiad, create new ones, manage users        |

`contributor` is **an app-level role only**. `auth.ts` pins the plugin to
`adminRoles: ['admin']`, so BetterAuth's own privileged operations (ban,
impersonate, setRole) are reachable by admins alone. Nothing in BetterAuth knows
what a contributor is — every contributor check is `guard.ts`'s.

The per-olympiad grant lives in `user.assigned_olympiads`, a JSON array of
olympiad ids. BetterAuth is told about the field with `input: false`, so it can
never be written through BetterAuth's own update-user endpoint; only the admin
panel writes it, directly via Drizzle.

## What the admin panel actually does

Seven form actions, all of them `requireAdmin`, and they divide into two groups
that are worth keeping apart because only the first group touches accounts.

| Action                 | Effect                                                | Refuses when                                                                |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `setRole`              | sets `role` to `user`, `contributor`, `admin` or `''` | the target is you, or a superadmin, or the role is not in the accepted list |
| `setAssignedOlympiads` | rewrites `assigned_olympiads` as a JSON array         | the target is you, or a superadmin                                          |
| `banUser`              | BetterAuth's ban, with a reason                       | the target is you, or a superadmin                                          |
| `unbanUser`            | lifts it                                              | the target is a superadmin                                                  |
| `ensureIndex`          | re-runs the FTS5 DDL, then `'rebuild'`                | —                                                                           |
| `optimizeIndex`        | `('merge', 500)` on the text index                    | —                                                                           |
| `pruneIndex`           | drops `file_text` rows with no owning file row        | —                                                                           |

**Three of the four account actions refuse to target the actor.** An admin cannot
demote themselves, reassign their own olympiads, or ban themselves — which is what
stops the last admin locking everyone out by accident. `unbanUser` needs no such
check: you cannot ban yourself, so you can never be the banned self you would
unban.

**The superadmin check appears in all four independently**, including
`unbanUser` — unbanning is a modification of a protected account like any other,
and leaving it out would have made the protection asymmetric.

The three index actions carry no account checks because they name no account. They
are documented in [search.md](./search.md#operating-the-index).

Everything an action does is written to `activity_log` by `logActivity`, which is
why the guards return `{ db, user }` — the caller needs a **non-nullable** user to
attribute the row to. See [data-model.md](./data-model.md#activity_log).

## The superadmin

A superadmin is an admin who **cannot be demoted, reassigned, banned or
unbanned** from the admin panel. `isProtectedSuperadmin()` is called by all four
of the actions that target another account — the three index-maintenance actions
target no user and do not consult it.

- Matched **by email**, against `SUPERADMIN_EMAIL`, because the variable is
  configuration written before the account exists.
- **Returns `false` when the variable is unset**, which silently disables the
  protection. That is deliberate: a self-hosted instance need not designate one.

The superadmin is not a fourth role and is not stored in the database. It is
purely a guard-time comparison.

## The guards

All three live in `guard.ts` and return `{ db, user }`, so a caller replaces the
`requireX(locals); const db = locals.db;` prologue with one line and gets a
non-nullable `user` for `logActivity`.

| Guard                               | Behaviour                                                          |
| ----------------------------------- | ------------------------------------------------------------------ |
| `requireAdmin(locals)`              | 403 unless `role === 'admin'`                                      |
| `requireContributor(locals)`        | **303 to `/login`** if signed out; 403 unless admin or contributor |
| `requireOlympiadEditor(locals, id)` | 403 unless admin, or a contributor assigned to `id`                |

`requireContributor` redirects rather than 403s an anonymous visitor because
signing in is the action they need to take; a 403 page would be a dead end.

Two helpers back them: `canEditOlympiad(user, id)` (the actual predicate) and
`getAssignedOlympiadIds(user)` (the JSON column, parsed tolerantly). Both take a
structural `{ role?, assignedOlympiads? }`, so a plain DB row works as well as a
session user.

### Which guard each route uses

| Route                                                  | Guard                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `admin/+layout.server.ts`                              | `requireAdmin`                                                                                      |
| `admin` — all **seven** actions                        | `requireAdmin`, again, in every one                                                                 |
| `admin/reindex/+server.ts` — `GET` and `POST`          | **`requireAdmin`, called by the endpoint itself** — see below                                       |
| `contribute/+layout.server.ts`                         | `requireContributor`, **then `requireOlympiadEditor`** when the path names an olympiad              |
| `contribute` — `selectYear`                            | `canEditOlympiad` on the _submitted_ olympiad id                                                    |
| `contribute` — `createOlympiad`                        | `requireAdmin` — contributors work within olympiads they were assigned, they do not create new ones |
| `contribute/[olympiad]` — load and every action        | `requireOlympiadEditor`                                                                             |
| `contribute/[olympiad]/[year]` — load and every action | `requireOlympiadEditor`                                                                             |
| `contribute/[olympiad]/titles.csv`                     | `requireOlympiadEditor`                                                                             |
| `(reg)/login`                                          | redirects to `/profile` when already signed in                                                      |
| `(reg)/profile`                                        | redirects to `/login` when not                                                                      |
| `(reg)/olympiads/[olympiad]` — `?/trackProblem`        | a plain `locals.user` check — **not** a `guard.ts` function; see below                              |
| `(reg)/olympiads/[olympiad]/progress`                  | `error(401)` when signed out, header set **before** the guard                                       |
| `progress/+server.ts`                                  | `error(401)` when signed out, same ordering                                                         |
| everything under `/api/`                               | public — no handler there reads a cookie except `api/auth/[...all]`                                 |
| everything else                                        | public                                                                                              |

**A `+server.ts` runs no layout loads**, so `admin/+layout.server.ts` does not
cover `admin/reindex`. It calls `requireAdmin` itself, and so does
`contribute/[olympiad]/titles.csv` — the two endpoints that sit under a guarded
layout and are not protected by it. Any new endpoint added under `admin/` or
`contribute/` must do the same; the layout is not a perimeter.

**Tracking a problem is not an editing permission.** `?/trackProblem` guards with
a bare `locals.user` check because **any** signed-in user may track **any**
problem; routing it through `requireOlympiadEditor` would limit progress tracking
to contributors. The action resolves `problems.id` from
`(olympiad, year, number)` server-side, and validates a submitted score against
the `max_score` on that row — never against a value from the browser, even though
the browser can now read a maximum out of the public payload.

The two progress endpoints set `cache-control: private, no-store` **before** the
401, so a signed-out response cannot be cached either. Neither reads anything
from the URL beyond the olympiad id, and `/progress` reads nothing at all — its
only input is `locals.user.id`, which is what makes a future `?user=` wrong on its
face.

**The layout guard is never the only check.** It establishes that the user may
reach the contribute area at all; it says nothing about _which_ olympiad. Every
load and action re-checks with `requireOlympiadEditor`, because a contributor
assigned to one olympiad must not be able to edit another by typing its URL. The
same reasoning applies to `contribute`'s `selectYear`, which takes the olympiad
id from the form rather than the path and so has to do its own check.

## The client side

[`$lib/auth-client.ts`](../src/lib/auth-client.ts) is a `createAuthClient` with
the `adminClient` plugin — used for sign-in and sign-out from the browser. The
signed-in user reaches components as `data.user`, put there by the root
[`+layout.server.ts`](../src/routes/+layout.server.ts), and drives the avatar,
the sign-in button and whether `secondaryNavFor()` appends the admin link.

Nothing on the client is a permission check. Hiding the admin link is a
courtesy; `requireAdmin` is the control.
