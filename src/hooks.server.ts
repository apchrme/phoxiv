import type { Handle } from '@sveltejs/kit';
import { drizzle } from 'drizzle-orm/d1';

// Since Cloudflare Workers is serverless, we have to connect to the DB on every request. See https://jilles.me/cloudflare-workers-sveltekit-drizzle-and-d1-up-and-running/
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.db = drizzle(event.platform.env.DB);
	const response = await resolve(event);
	return response;
};
