// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';

declare global {
	namespace App {
		interface Locals {
			db: DrizzleD1Database;
		}
		interface Platform {
			env: Env & {
				FILES: R2Bucket;
			};
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
