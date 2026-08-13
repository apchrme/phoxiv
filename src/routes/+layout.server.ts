import type { LayoutServerLoad } from './$types';

/** Exposes the signed-in user to every page, for nav links and avatars. */
export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: locals.user
	};
};
