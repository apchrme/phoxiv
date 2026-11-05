/*
 * The sign-in providers, in the order the login page offers them. Client-safe,
 * so the login and profile pages name them the same way. Each id must match a
 * key of `socialProviders` in `#lib/server/auth.ts`, which is also the
 * `account.provider_id` BetterAuth stores. See docs/auth.md.
 */

export const AUTH_PROVIDERS = [
	{ id: 'github', label: 'GitHub' },
	{ id: 'google', label: 'Google' }
] as const;

export type AuthProviderId = (typeof AUTH_PROVIDERS)[number]['id'];

export function isAuthProviderId(id: string): id is AuthProviderId {
	return AUTH_PROVIDERS.some((p) => p.id === id);
}

/**
 * What the login page says when BetterAuth sends a failed sign-in back with
 * `?error=<code>` (its `errorCallbackURL`). Codes not listed get the fallback.
 */
export function signInErrorMessage(code: string): string {
	switch (code) {
		case 'account_not_linked':
		case 'unable_to_link_account':
			// Implicit linking refused: the email belongs to an existing user, but
			// one side has not verified it. See docs/auth.md, "Account linking".
			return 'An account with this email already exists, but the email isn’t verified on both sign-in methods, so we couldn’t join them. Sign in the way you did before, or verify your email with the provider and try again.';
		case 'access_denied':
			return 'Sign-in was cancelled.';
		default:
			return 'Sign-in didn’t complete. Please try again.';
	}
}
