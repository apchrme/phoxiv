import { createHmac } from 'node:crypto';
import { sessionToken, type UserKey } from '../fixtures/seed-data';
import { HOST, SECRET } from './env';

/*
 * Signing in without GitHub. Each seeded user has a session row
 * (`fixtures/seed-data.ts`); the tests present its token in a cookie signed the
 * way BetterAuth signs it. The `setup` project's canary fails first if this ever
 * drifts from BetterAuth. See docs/testing.md, "Signing in without GitHub".
 */

/**
 * BetterAuth's session cookie on an http origin. `https://phoxiv.org` uses
 * `__Secure-better-auth.session_token`; the prefix follows `BETTER_AUTH_URL`'s
 * protocol (better-auth's `createCookieGetter`).
 */
export const SESSION_COOKIE = 'better-auth.session_token';

/**
 * The cookie value for a seeded user: `encodeURIComponent(token + '.' + sig)`,
 * where `sig` is the base64 HMAC-SHA256 of the token under `BETTER_AUTH_SECRET`.
 * This mirrors better-call's `signCookieValue`; its `getSignedCookie` accepts only
 * a 44-character signature ending in `=`, which a SHA-256 digest always is.
 */
export function signedSessionValue(key: UserKey): string {
	const token = sessionToken(key);
	const signature = createHmac('sha256', SECRET).update(token).digest('base64');
	return encodeURIComponent(`${token}.${signature}`);
}

/** `name=value` for a `Cookie` request header. */
export function sessionCookieHeader(key: UserKey): string {
	return `${SESSION_COOKIE}=${signedSessionValue(key)}`;
}

/** A cookie for `browserContext.addCookies` or a `storageState`. */
export function sessionCookie(key: UserKey) {
	return {
		name: SESSION_COOKIE,
		value: signedSessionValue(key),
		domain: HOST,
		path: '/',
		httpOnly: true,
		secure: false,
		sameSite: 'Lax' as const,
		expires: -1
	};
}

/** A `storageState` signed in as `key`, or signed out for `null`. */
export function storageStateFor(key: UserKey | null) {
	return { cookies: key ? [sessionCookie(key)] : [], origins: [] };
}
