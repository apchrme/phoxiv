import type { Handle } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.platform?.env.DB) {
		event.locals.db = drizzle(event.platform.env.DB);
	} else {
		throw new Error('Database unavailable');
	}

	const response = await resolve(event);
	return response;
};
