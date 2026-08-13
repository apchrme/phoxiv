import type { DrizzleD1Database } from 'drizzle-orm/d1';

export * from './schema';

/**
 * The Drizzle handle, as built in `hooks.server.ts` and exposed on `locals.db`.
 *
 * Every query function takes this as its first parameter. Aliasing it here means
 * the ~20 signatures in `queries/` do not each have to name the D1 driver, and
 * that binding the client to the schema later is a one-line change.
 */
export type DB = DrizzleD1Database;
