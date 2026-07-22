import { requireAdmin } from '$lib/server/guard.js';

export const load = ({ locals }) => {
	requireAdmin(locals);
};
