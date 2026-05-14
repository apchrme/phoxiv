import { redirect, error } from '@sveltejs/kit';

export const load = ({ locals }) => {
	if (!locals.user) redirect(303, '/login');
	else if (locals.user.role != "admin") error(403, 'Unauthorised');
};