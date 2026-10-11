import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/*
 * BetterAuth's own endpoints, forwarded to `locals.auth.handler` with two
 * exceptions (docs/auth.md, "Sessions"):
 *
 * - `/api/auth/admin/*` is closed. The admin plugin serves `set-role`,
 *   `ban-user`, `impersonate-user` and more over HTTP, and an admin's cookie
 *   reaches them, but they skip the admin panel's rules: the superadmin, the
 *   self-protection and `ACCEPTED_ROLES` (admin/+page.server.ts). Through
 *   `set-role` an admin could demote the superadmin. The app never calls them:
 *   every admin action is a form action. The plugin itself stays, because it
 *   provides `role`, `banned` and the sign-in ban check.
 * - A banned user is signed out here too, as in hooks.server.ts. BetterAuth
 *   checks `banned` only when it creates a session, so a session kept after a
 *   ban set by hand in SQL still answered `get-session` and `update-user`.
 *
 * Never add cache headers: this route carries Set-Cookie and session state.
 */

/**
 * Matched by prefix, not with BetterAuth's `disabledPaths`, which takes exact
 * paths only: an endpoint a plugin upgrade added would be exposed silently.
 */
const ADMIN_ENDPOINTS = '/api/auth/admin';

/** The request without its session cookies if their user is banned, else unchanged. */
async function withoutBannedSession(auth: App.Locals['auth'], request: Request): Promise<Request> {
	const cookie = request.headers.get('cookie');
	if (!cookie) return request;

	// `disableRefresh`: refreshing here would extend the session in the database
	// while its new cookie was thrown away, the bug hooks.server.ts records.
	const session = await auth.api.getSession({
		headers: request.headers,
		query: { disableRefresh: true }
	});
	if (!session?.user.banned) return request;

	// Only the session cookies, not every cookie, so an OAuth `state` cookie
	// survives. The cookie cache is split into `<name>.<n>` chunks when large.
	const { authCookies } = await auth.$context;
	const names = [
		authCookies.sessionToken.name,
		authCookies.sessionData.name,
		authCookies.accountData.name,
		authCookies.dontRememberToken.name
	];
	const kept = cookie
		.split(';')
		.map((pair) => pair.trim())
		.filter((pair) => {
			const eq = pair.indexOf('=');
			const name = (eq === -1 ? pair : pair.slice(0, eq)).trim();
			return !names.some((n) => name === n || name.startsWith(`${n}.`));
		});

	const headers = new Headers(request.headers);
	if (kept.length > 0) headers.set('cookie', kept.join('; '));
	else headers.delete('cookie');
	return new Request(request, { headers });
}

/** True for any path BetterAuth could route to an admin-plugin endpoint. */
function isAdminEndpoint(pathname: string): boolean {
	// Collapsed and lowercased, so `//admin` or `/Admin` can't slip past.
	const path = pathname.replace(/\/{2,}/g, '/').toLowerCase();
	return path === ADMIN_ENDPOINTS || path.startsWith(`${ADMIN_ENDPOINTS}/`);
}

const handler: RequestHandler = async ({ request, url, locals }) => {
	if (isAdminEndpoint(url.pathname)) error(404, 'Not found');
	return locals.auth.handler(await withoutBannedSession(locals.auth, request));
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
