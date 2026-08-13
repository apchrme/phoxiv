import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Nothing to log into if you already are. */
export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/profile');
};
