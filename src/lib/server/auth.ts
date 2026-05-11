import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './db/schema';

type AuthEnv = {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	BETTER_AUTH_SECRET: string;
};

export function createAuth(db: DrizzleD1Database, env: AuthEnv) {
	return betterAuth({
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, {
			provider: 'sqlite',
			schema: {
				user: schema.user,
				session: schema.session,
				account: schema.account,
				verification: schema.verification
			}
		}),
		socialProviders: {
			github: {
				clientId: env.GITHUB_CLIENT_ID,
				clientSecret: env.GITHUB_CLIENT_SECRET
			}
		}
	});
}