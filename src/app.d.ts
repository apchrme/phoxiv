// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { createAuth } from '$lib/server/auth';

type Auth = ReturnType<typeof createAuth>;

/**
 * BetterAuth's inferred session shape, including admin-plugin fields and
 * `assignedOlympiads`. Inferred from the auth instance, not the Drizzle table,
 * because BetterAuth returns `undefined` where Drizzle's types say `null`.
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
