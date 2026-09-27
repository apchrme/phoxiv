import type { DrizzleD1Database } from 'drizzle-orm/d1';

export * from './schema';

/** The Drizzle handle on `locals.db`, built in `hooks.server.ts`. Every query function takes it first. */
export type DB = DrizzleD1Database;
