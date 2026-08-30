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

## The superadmin

A superadmin is an admin who **cannot be demoted, banned or unbanned** from the
admin panel. `isProtectedSuperadmin()` is called by all four admin actions.

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
| `admin` — all four actions                             | `requireAdmin`, again                                                                               |
| `contribute/+layout.server.ts`                         | `requireContributor`                                                                                |
| `contribute` — `selectYear`                            | `canEditOlympiad` on the _submitted_ olympiad id                                                    |
| `contribute` — `createOlympiad`                        | `requireAdmin` — contributors work within olympiads they were assigned, they do not create new ones |
| `contribute/[olympiad]` — load and every action        | `requireOlympiadEditor`                                                                             |
| `contribute/[olympiad]/[year]` — load and every action | `requireOlympiadEditor`                                                                             |
| `contribute/[olympiad]/titles.csv`                     | `requireOlympiadEditor`                                                                             |
| `(reg)/login`                                          | redirects to `/profile` when already signed in                                                      |
| `(reg)/profile`                                        | redirects to `/login` when not                                                                      |
| everything else                                        | public                                                                                              |

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
