import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { user, type DB } from './db';
import { parseStringArray } from '$lib/utils/json';

/**
 * Authorisation for loads, actions and endpoints.
 *
 * The three roles are `user` (the default: read-only), `contributor` (may edit
 * only the olympiads assigned to them) and `admin` (may edit everything and
 * manage users). A superadmin is an admin whose email matches
 * `SUPERADMIN_EMAIL`; they cannot be demoted, banned or unbanned.
 *
 * Every `require*` helper returns `{ db, user }` so a caller can replace the
 * two-line `requireX(locals); const db = locals.db;` prologue with one line and
 * get a non-nullable `user` for `logActivity`. See `docs/auth.md`.
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
 * Throws 403 unless the current user may reach the contribute area at all.
 *
 * Anonymous visitors are redirected to the login page instead, since signing in
 * is the action they need to take. Per-olympiad permission is a separate,
 * narrower check — see {@link requireOlympiadEditor}.
 */
export function requireContributor(locals: App.Locals): GuardedContext {
	if (!locals.user) redirect(303, '/login');
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
 * True if `userId` is the superadmin, who must not be modified by anyone.
 *
 * Compared by email rather than id because `SUPERADMIN_EMAIL` is configuration
 * written before the account exists. Returns `false` when the variable is unset,
 * which disables the protection — deliberate, so a self-hosted instance need not
 * designate one.
 */
export async function isProtectedSuperadmin(
	db: DB,
	platform: App.Platform | undefined,
	userId: string
): Promise<boolean> {
	const superadminEmail = platform?.env.SUPERADMIN_EMAIL;
	if (!superadminEmail) return false;
	const target = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).get();
	return target?.email === superadminEmail;
}
