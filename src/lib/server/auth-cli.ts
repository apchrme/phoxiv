import { betterAuth } from 'better-auth';
import { env as cfenv } from 'cloudflare:workers';
import { authOptions } from './auth';

/**
 * A module-level auth instance for the BetterAuth schema generator.
 *
 * `bun run db:generate-auth` needs to import the configuration statically, which
 * the real `createAuth(db, env)` cannot provide — its database handle only exists
 * inside a request. This wraps the exact same {@link authOptions} with a
 * build-time D1 binding and `process.env`, so the generated schema always matches
 * the running config.
 *
 * Never imported by application code.
 */
export const auth = betterAuth(authOptions(cfenv.DB, process.env));
