import type { LayoutServerLoad } from './$types';
import { requireAdmin } from '$lib/server/guard';

/** Gates the admin panel. Each action re-checks, so a stale page cannot act. */
export const load: LayoutServerLoad = ({ locals }) => {
	requireAdmin(locals);
};
