import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import { admin } from 'better-auth/plugins';

type AuthEnv = {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	BETTER_AUTH_SECRET: string;
	TRUSTED_ORIGINS: string;
};

export function createAuth(db: DrizzleD1Database, env: AuthEnv) {
	return betterAuth({
		trustedOrigins: env.TRUSTED_ORIGINS?.split(',') ?? [],
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
		},
		user: {
			additionalFields: {
				assignedOlympiads: {
					type: 'string',
					required: false,
					defaultValue: '[]',
					// Never settable by the user themselves through BetterAuth's own
					// update-user endpoint — only our admin panel writes this directly via Drizzle.
					input: false
				}
			}
		},
		plugins: [
			admin({
				// Explicit: only "admin" gets BetterAuth's own privileged admin powers
				// (ban/impersonate/setRole). "contributor" is a purely app-level role
				// enforced by our own guard.ts, not by BetterAuth's admin plugin.
				adminRoles: ['admin']
			})
		]
	});
}
