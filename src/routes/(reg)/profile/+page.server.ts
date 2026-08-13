import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** There is no profile to show without a session. */
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
};
