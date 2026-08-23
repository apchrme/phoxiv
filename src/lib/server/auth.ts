import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { admin } from 'better-auth/plugins';
import * as schema from './db/schema';

/**
 * BetterAuth configuration.
 *
 * Exported as a *function*, not a constant, because the D1 binding only exists
 * per-request inside the Worker — `hooks.server.ts` builds one instance per
 * request from `platform.env`.
 *
 * `auth-cli.ts` wraps the same options with a build-time database handle so the
 * BetterAuth schema generator can read the config without a live request. Both
 * must stay in sync, which is what {@link authOptions} is for. See `docs/auth.md`.
 */

/** The subset of the Worker environment that auth needs. */
export type AuthEnv = {
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	BETTER_AUTH_SECRET?: string;
	TRUSTED_ORIGINS?: string;
};

/**
 * The single BetterAuth configuration, parameterised over the database handle.
 *
 * `database` is typed from the adapter rather than as a Drizzle client because
 * the two callers supply different things: a Drizzle client at runtime, and a
 * raw D1 binding under the CLI.
 *
 * The return type is deliberately inferred with `satisfies` rather than
 * annotated as `BetterAuthOptions`. BetterAuth derives the session's user shape
 * from the *literal* options type, so annotating it would widen the object and
 * strip `role`, `banned` and `assignedOlympiads` off `locals.user`.
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
	} satisfies BetterAuthOptions;
}

/** Builds a per-request auth instance. Called once per request by `hooks.server.ts`. */
export function createAuth(database: Parameters<typeof drizzleAdapter>[0], env: AuthEnv) {
	return betterAuth(authOptions(database, env));
}
