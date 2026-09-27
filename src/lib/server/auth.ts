import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { admin } from 'better-auth/plugins';
import * as schema from './db/schema';

/*
 * BetterAuth configuration. A function, not a constant, because the D1 binding
 * only exists per request; `hooks.server.ts` builds one instance per request.
 * `auth-cli.ts` reuses {@link authOptions} for the schema generator.
 * See docs/auth.md.
 */

/** The subset of the Worker environment that auth needs. */
export type AuthEnv = {
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	BETTER_AUTH_SECRET?: string;
	TRUSTED_ORIGINS?: string;
};

/**
 * The BetterAuth options. `database` is a Drizzle client at runtime and a raw D1
 * binding under the CLI.
 *
 * Use `satisfies`, not a `BetterAuthOptions` annotation: BetterAuth infers the
 * user type from the literal options, and widening would drop `role`, `banned`
 * and `assignedOlympiads` from `locals.user`.
 */
export function authOptions(database: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
	return {
		trustedOrigins: env.TRUSTED_ORIGINS?.split(',') ?? [],
		secret: env.BETTER_AUTH_SECRET,
		database: drizzleAdapter(database, {
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
				clientId: env.GITHUB_CLIENT_ID as string,
				clientSecret: env.GITHUB_CLIENT_SECRET as string
			}
		},
		user: {
			additionalFields: {
				assignedOlympiads: {
					type: 'string',
					required: false,
					defaultValue: '[]',
					// Users can't set this via BetterAuth's update-user endpoint; only
					// the admin panel writes it, via Drizzle.
					input: false
				}
			}
		},
		plugins: [
			admin({
				// Only "admin" gets BetterAuth's admin powers (ban, impersonate, setRole).
				// "contributor" is enforced only by guard.ts; the plugin knows nothing of it.
				adminRoles: ['admin']
			})
		]
	} satisfies BetterAuthOptions;
}

/** Builds a per-request auth instance, for `hooks.server.ts`. */
export function createAuth(database: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
	return betterAuth(authOptions(database, env));
}
