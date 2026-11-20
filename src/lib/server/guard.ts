import { error, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { user, type DB } from './db';
import { parseStringArray } from '#lib/utils/json.js';

/*
 * Authorisation for loads, actions and endpoints.
 *
 * Roles: `user` (read-only), `contributor` (edits assigned olympiads only) and
 * `admin` (everything). The superadmin (`SUPERADMIN_EMAIL`) can't be demoted,
 * banned or unbanned. `require*` helpers return `{ db, user }` with a non-null
 * user. See docs/auth.md.
 */

/** The signed-in user, once a guard has established there is one. */
export type ActingUser = NonNullable<App.Locals['user']>;

/** What every `require*` helper hands back. */
export type GuardedContext = { db: DB; user: ActingUser };

/** Just the fields the permission checks read, so plain DB rows work too. */
type PermissionUser =
	{ role?: string | null; assignedOlympiads?: string | null } | null | undefined;

/** The olympiad ids a contributor may edit, from the JSON-encoded column. */
export function getAssignedOlympiadIds(u: PermissionUser): string[] {
	return parseStringArray(u?.assignedOlympiads);
}

/** True if the user is an admin, or a contributor assigned to `olympiadId`. */
export function canEditOlympiad(u: PermissionUser, olympiadId: string): boolean {
	if (!u) return false;
	if (u.role === 'admin') return true;
	return u.role === 'contributor' && getAssignedOlympiadIds(u).includes(olympiadId);
}

/** Throws 403 unless the current user is an admin. */
export function requireAdmin(locals: App.Locals): GuardedContext {
	if (!locals.user || locals.user.role !== 'admin') error(403, 'Unauthorised');
	return { db: locals.db, user: locals.user };
}

/**
 * Throws 403 unless the user is a contributor or admin; redirects anonymous
 * visitors to login, which sends them back to `url` afterwards. Per-olympiad
 * checks use {@link requireOlympiadEditor}.
 */
export function requireContributor(locals: App.Locals, url: URL): GuardedContext {
	if (!locals.user) redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
	if (locals.user.role !== 'admin' && locals.user.role !== 'contributor') {
		error(403, 'Unauthorised');
	}
	return { db: locals.db, user: locals.user };
}

/** Throws 403 unless the current user may edit `olympiadId`. */
export function requireOlympiadEditor(locals: App.Locals, olympiadId: string): GuardedContext {
	if (!canEditOlympiad(locals.user, olympiadId)) error(403, 'Unauthorised');
	return { db: locals.db, user: locals.user! };
}

/**
 * True if `email` is `SUPERADMIN_EMAIL`. Matched by email since the config
 * predates the account. If the variable is unset, nobody matches.
 */
function isSuperadminEmail(email: string | null | undefined): boolean {
	const superadminEmail = env.SUPERADMIN_EMAIL;
	return !!superadminEmail && email === superadminEmail;
}

/** True if `u` is an admin whose email is `SUPERADMIN_EMAIL`. */
export function isSuperadmin(
	u: { role?: string | null; email?: string | null } | null | undefined
) {
	return !!u && u.role === 'admin' && isSuperadminEmail(u.email);
}

/**
 * Throws 403 unless the current user is the superadmin. For what even an admin
 * may not do, such as deleting an olympiad.
 */
export function requireSuperadmin(locals: App.Locals): GuardedContext {
	if (!isSuperadmin(locals.user)) error(403, 'Unauthorised');
	return { db: locals.db, user: locals.user! };
}

/**
 * True if `userId` is the superadmin, who must not be modified. See
 * {@link isSuperadminEmail}.
 */
export async function isProtectedSuperadmin(db: DB, userId: string): Promise<boolean> {
	if (!env.SUPERADMIN_EMAIL) return false;
	const target = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).get();
	return isSuperadminEmail(target?.email);
}
