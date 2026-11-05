import type { Page } from '@playwright/test';
import { BASE_URL } from '../../support/env';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The sign-in providers: the login page offers GitHub and Google, each button
 * starts that provider's OAuth flow with the right client and callback, a
 * failed sign-in comes back to the login page with a reason, and the profile
 * lists every provider linked to the user.
 *
 * No test completes an OAuth round trip: the guards abort every external
 * request, so a provider's authorisation request is caught, read and dropped.
 * Implicit linking itself is BetterAuth's; docs/testing.md lists the manual
 * check. Reads the frozen USERS.user (GitHub and Google) and USERS.admin
 * (GitHub only). Each sign-in attempt writes a `verification` row for its OAuth
 * state, which nothing reads.
 */

/** Clicks a provider's button and returns the authorisation URL the browser was sent to. */
async function startSignIn(page: Page, label: string, host: string): Promise<URL> {
	const request = page.waitForRequest((r) => new URL(r.url()).host === host);
	await page.getByRole('button', { name: `Continue with ${label}` }).click();
	return new URL((await request).url());
}

test.describe('the login page', () => {
	test('offers GitHub and Google', { tag: '@smoke' }, async ({ page }) => {
		await gotoReady(page, '/login');
		await expect(page.getByRole('button', { name: /^Continue with/ })).toHaveText([
			'Continue with GitHub',
			'Continue with Google'
		]);
	});

	test('sends Google sign-in to Google with this client and callback', async ({ page }) => {
		await gotoReady(page, '/login');
		const url = await startSignIn(page, 'Google', 'accounts.google.com');

		expect(url.pathname).toBe('/o/oauth2/v2/auth');
		expect(url.searchParams.get('client_id')).toBe('e2e-dummy-google-client-id');
		expect(url.searchParams.get('redirect_uri')).toBe(`${BASE_URL}/api/auth/callback/google`);
		// The verified-email claim implicit linking relies on comes from the id token.
		expect(url.searchParams.get('scope')?.split(' ')).toEqual(
			expect.arrayContaining(['openid', 'email', 'profile'])
		);
		// auth.ts: lets someone signed into the wrong Google account pick another.
		expect(url.searchParams.get('prompt')).toBe('select_account');
	});

	test('sends GitHub sign-in to GitHub with this client and callback', async ({ page }) => {
		await gotoReady(page, '/login');
		const url = await startSignIn(page, 'GitHub', 'github.com');

		expect(url.pathname).toBe('/login/oauth/authorize');
		expect(url.searchParams.get('client_id')).toBe('e2e-dummy-client-id');
		expect(url.searchParams.get('redirect_uri')).toBe(`${BASE_URL}/api/auth/callback/github`);
	});

	test('asks BetterAuth to send a failed sign-in back here, keeping ?redirect=', async ({
		page
	}) => {
		await gotoReady(page, '/login?redirect=%2Fcontribute');
		const request = page.waitForRequest('**/api/auth/sign-in/social');
		await page.getByRole('button', { name: 'Continue with Google' }).click();

		expect((await request).postDataJSON()).toMatchObject({
			provider: 'google',
			callbackURL: '/contribute',
			errorCallbackURL: '/login?redirect=%2Fcontribute'
		});
	});

	test('explains a refused account link', async ({ page }) => {
		// Where BetterAuth's callback sends an implicit link it refuses (an email
		// unverified on one side), by way of `errorCallbackURL`.
		await gotoReady(page, '/login?error=account_not_linked');
		await expect(page.getByRole('alert')).toContainText(
			'An account with this email already exists'
		);
	});

	test('gives any other failure a generic reason', async ({ page }) => {
		await gotoReady(page, '/login?error=invalid_code');
		await expect(page.getByRole('alert')).toHaveText('Sign-in didn’t complete. Please try again.');
	});

	test('shows no alert without an error', async ({ page }) => {
		await gotoReady(page, '/login');
		await expect(page.getByRole('alert')).toHaveCount(0);
	});
});

test.describe('the profile', () => {
	test('lists both providers for a user who linked them', async ({ as }) => {
		const page = await as('user');
		await gotoReady(page, '/profile');
		await expect(
			page.getByRole('list', { name: 'Sign-in methods' }).getByRole('listitem')
		).toHaveText(['GitHub', 'Google']);
	});

	test('lists only the provider a user signed in with', async ({ as }) => {
		const page = await as('admin');
		await gotoReady(page, '/profile');
		await expect(
			page.getByRole('list', { name: 'Sign-in methods' }).getByRole('listitem')
		).toHaveText(['GitHub']);
	});
});
