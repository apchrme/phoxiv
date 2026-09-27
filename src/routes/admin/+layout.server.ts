import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guard';

/**
 * Gates the admin pages. Actions re-check, so a stale page can't act. Doesn't
 * cover `+server.ts` endpoints, which must call `requireAdmin` themselves.
 */
export const load: LayoutServerLoad = ({ locals }) => {
	requireAdmin(locals);
};
