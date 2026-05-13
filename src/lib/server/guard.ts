import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export function requireAdmin(locals: RequestEvent['locals']) {
    if (!locals.user || locals.user.role != 'admin') error(403, 'Unauthorised');
}