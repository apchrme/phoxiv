// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { user, session } from '$lib/server/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

declare global {
	namespace App {
		interface Locals {
			db: DrizzleD1Database;
			user: InferSelectModel<typeof user> | null;
			session: InferSelectModel<typeof session> | null;
		}
		interface Platform {
			env: Env & {
				FILES: R2Bucket;
				GITHUB_CLIENT_ID: string;
				GITHUB_CLIENT_SECRET: string;
				BETTER_AUTH_SECRET: string;
				SUPERADMIN_EMAIL: string;
			};
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};