// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { createAuth } from '$lib/server/auth';

type Auth = ReturnType<typeof createAuth>;

/**
 * BetterAuth's own inferred session shape, including the `admin` plugin's
 * `role`/`banned`/`banExpires` fields and our `assignedOlympiads` additional
 * field. Deliberately derived from the auth instance rather than from the
 * Drizzle table: BetterAuth returns `undefined` for absent optional columns
 * where Drizzle's `InferSelectModel` promises `null`, so the Drizzle model is
 * not assignable to what `getSession` actually hands back.
 */
type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

declare global {
	namespace App {
		interface Locals {
			db: DrizzleD1Database;
			/** The per-request BetterAuth instance. Always set by `hooks.server.ts`. */
			auth: Auth;
			user: AuthSession['user'] | null;
			session: AuthSession['session'] | null;
		}
		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
