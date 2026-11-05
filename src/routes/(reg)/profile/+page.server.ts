import { redirect } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import { AUTH_PROVIDERS, isAuthProviderId } from '#lib/auth-providers.js';
import { account } from '#lib/server/db/index.js';
import type { PageServerLoad } from './$types';

/** There is no profile to show without a session. */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');

	// The sign-in methods linked to this user. More than one when the same email
	// signed in through a second provider (implicit linking; docs/auth.md).
	const rows = await locals.db
		.select({ providerId: account.providerId })
		.from(account)
		.where(eq(account.userId, locals.user.id))
		.orderBy(asc(account.createdAt));
	const linked = new Set(rows.map((r) => r.providerId).filter(isAuthProviderId));

	return { providers: AUTH_PROVIDERS.filter((p) => linked.has(p.id)) };
};
