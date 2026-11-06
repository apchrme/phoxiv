import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Nothing to log into if you already are: go to the dashboard, as sign-in does. */
export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};
