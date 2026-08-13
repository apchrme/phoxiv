import { redirect, error } from '@sveltejs/kit';

export const load = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	if (locals.user.role !== 'admin' && locals.user.role !== 'contributor') {
		error(403, 'Unauthorised');
	}
};
