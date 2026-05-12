import { redirect, error } from '@sveltejs/kit';

export const load = ({ locals }) => {
	if (!locals.user) redirect(303, '/api/auth/signin/github');
	else if (locals.user.role != "admin") error(403);
	return { user: locals.user };
};