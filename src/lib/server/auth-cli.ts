import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from './db/schema';
import { admin } from 'better-auth/plugins';
import { env as cfenv } from 'cloudflare:workers';

const env = process.env;

export const auth = betterAuth({
	trustedOrigins: env.TRUSTED_ORIGINS?.split(',') ?? [],
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(cfenv.DB, {
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
	plugins: [admin()]
});
