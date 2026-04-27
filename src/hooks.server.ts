import type { Handle } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';

export const handle: Handle = async ({ event, resolve }) => {
	if (event.platform?.env.DB) {
		event.locals.db = drizzle(event.platform.env.DB);
	} else {
		throw new Error('Database unavailable');
	}
  
	const response = await resolve(event);
	
	// Apply caching to all successful GET requests
	if (event.request.method === 'GET' && response.status === 200) {
    	response.headers.set('cache-control', 'max-age=0, s-maxage=86400, stale-while-revalidate=60');
	}
	
	return response;
};
