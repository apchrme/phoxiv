import { betterAuth } from 'better-auth';
import { env as cfenv } from 'cloudflare:workers';
import { authOptions } from './auth';

/**
 * A module-level auth instance for `bun run db:generate-auth`, which needs a
 * static import. Uses the same {@link authOptions} as the app, so the generated
 * schema matches. Never import this from application code.
 */
export const auth = betterAuth(authOptions(cfenv.DB, process.env));
