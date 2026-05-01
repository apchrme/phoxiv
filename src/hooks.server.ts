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
	// if (event.request.method === 'GET' && response.status === 200) {
		// max-age=0: prevents local cache from being used, so purge cache in cloudflare will update everyone's cache
		// s-maxage=86400: shared cache only updates at most once a day
		// stale-while-revalidate=604800: the shared cache will serve stale data after a day of "freshness", but force revalidation in the background. This ensures that no one will have to deal with a cache miss (unless no one views the site for a week)
    	// response.headers.set('cache-control', 'max-age=0, s-maxage=86400, stale-while-revalidate=604800');
		// if you need to immediately see changes, nuke the phoxiv.org cache on the Cloudflare dashboard.
	// }
	
	return response;
};
