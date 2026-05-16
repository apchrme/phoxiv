import { fail } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export function requireAdmin(locals: RequestEvent['locals']) {
	if (!locals.user || locals.user.role != 'admin') fail(403, 'Unauthorised');
}
