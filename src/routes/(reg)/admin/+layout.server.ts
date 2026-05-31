import { error } from '@sveltejs/kit';

export const load = ({ locals }) => {
	if (!locals.user || locals.user.role !== 'admin') error(403, 'Unauthorised');
};
