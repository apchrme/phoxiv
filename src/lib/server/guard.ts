import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

type GuardUser =
	| {
			role?: string | null;
			assignedOlympiads?: string | null;
	  }
	| null
	| undefined;

/** Parses the JSON-encoded `assignedOlympiads` column into a string array. */
export function getAssignedOlympiadIds(user: GuardUser): string[] {
	if (!user?.assignedOlympiads) return [];
	try {
		const parsed = JSON.parse(user.assignedOlympiads);
		return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

/** True if the user is an admin, or a contributor assigned to `olympiadId`. */
export function canEditOlympiad(user: GuardUser, olympiadId: string): boolean {
	if (!user) return false;
	if (user.role === 'admin') return true;
	return user.role === 'contributor' && getAssignedOlympiadIds(user).includes(olympiadId);
}

export function requireAdmin(locals: RequestEvent['locals']) {
	if (!locals.user || locals.user.role !== 'admin') error(403, 'Unauthorised');
}

/** Throws 403 unless the current user can edit `olympiadId` (admin, or assigned contributor). */
export function requireOlympiadEditor(locals: RequestEvent['locals'], olympiadId: string) {
	if (!canEditOlympiad(locals.user, olympiadId)) error(403, 'Unauthorised');
}
