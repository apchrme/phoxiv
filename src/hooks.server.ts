import type { Handle } from '@sveltejs/kit';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.db = drizzle(event.platform.env.DB);
    const response = await resolve(event);
    return response;
};