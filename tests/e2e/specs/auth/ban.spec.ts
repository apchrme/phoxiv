import type { Locator, Page } from '@playwright/test';
import { USERS } from '../../fixtures/seed-data';
import { BASE_URL } from '../../support/env';
import { expect, test } from '../../support/test';
import { confirmDialog, gotoReady, holdAction, toast } from '../../support/ui';

/*
 * Bans: the admin panel's ban and unban controls, and the two gaps
 * src/routes/api/auth/[...all]/+server.ts closes: BetterAuth's admin endpoints,
 * and a banned user's session on `/api/auth/*`.
 *
 * Owns USERS.apiTarget, USERS.banTarget and USERS.unbanTarget. Reads the frozen
 * USERS.banned and USERS.admin without writing them.
 */

test.describe("BetterAuth's admin endpoints", { tag: '@smoke' }, () => {
	test('are closed, even to an admin', async ({ apiAs }) => {
		// "Through `set-role` an admin could demote the superadmin" (+server.ts).
		// Every admin action goes through the admin panel's form actions instead.
		const admin = await apiAs('admin');
		const body = { userId: USERS.apiTarget.id, role: 'admin', banReason: 'x' };
		for (const path of [
			'/api/auth/admin/set-role',
			'/api/auth/admin/ban-user',
			'/api/auth/admin/unban-user',
			'/api/auth/admin/impersonate-user',
			'/api/auth/admin/remove-user',
			// The check is on a prefix, so an endpoint added by an upgrade is closed too.
			'/api/auth/admin/not-an-endpoint-yet',
			// Spellings BetterAuth's router might still resolve.
			'/api/auth//admin/set-role',
			'/api/auth/Admin/set-role'
		]) {
			const response = await admin.post(path, { headers: { origin: BASE_URL }, data: body });
			expect(response.status(), path).toBe(404);
			expect(await response.text(), path).toContain('Not found');
		}

		const list = await admin.get('/api/auth/admin/list-users');
		expect(list.status()).toBe(404);
	});

	test('leave the rest of /api/auth open', async ({ apiAs }) => {
		const response = await (await apiAs('admin')).get('/api/auth/get-session');
		expect(response.status()).toBe(200);
		expect((await response.json())?.user?.id).toBe(USERS.admin.id);
	});
});

test.describe('a user banned by hand in SQL, on /api/auth', { tag: '@smoke' }, () => {
	// USERS.banned has `banned` set and its session kept. hooks.server.ts signs
	// such a user out of every page; /api/auth/* must agree.

	test('gets no session', async ({ apiAs }) => {
		const response = await (await apiAs('banned')).get('/api/auth/get-session');
		expect(response.status()).toBe(200);
		expect(await response.json()).toBeNull();
	});

	test('cannot update their account', async ({ apiAs }) => {
		// The same name, so nothing would change even if the request got through.
		const response = await (
			await apiAs('banned')
		).post('/api/auth/update-user', {
			headers: { origin: BASE_URL },
			data: { name: USERS.banned.name }
		});
		expect(response.status()).toBe(401);
	});
});

/**
 * The admin panel's users-table row for `email`, searched for so paging can't
 * hide it. The cell must match exactly: `ban-target@e2e.test` is a substring of
 * `unban-target@e2e.test`, so the search shows both.
 */
async function userRow(page: Page, email: string): Promise<Locator> {
	await page.getByPlaceholder('Search users…').fill(email);
	const row = page
		.getByRole('row')
		.filter({ has: page.getByRole('cell', { name: email, exact: true }) });
	await expect(row).toHaveCount(1);
	return row;
}

test.describe("the admin panel's ban controls", () => {
	// Acts as the frozen USERS.admin on USERS.banTarget and USERS.unbanTarget,
	// which this file owns. The run's reseed resets both.
	test.use({ role: 'admin' });

	test('banning asks first, then signs the target out on their next request', async ({
		page,
		as
	}) => {
		const { name, email } = USERS.banTarget;

		// The target is signed in elsewhere, on a page that needs a session.
		const target = await as('banTarget');
		await gotoReady(target, '/contribute');
		await expect(target.getByRole('heading', { level: 1, name: 'Contribute' })).toBeVisible();

		await gotoReady(page, '/admin');
		const row = await userRow(page, email);
		await row.getByRole('button', { name: 'Ban', exact: true }).click();

		// "Banning asks for confirmation; unbanning doesn't." (UserRowActions.svelte)
		const dialog = confirmDialog(page);
		await expect(dialog).toHaveAccessibleName(`Ban ${name}?`);
		await expect(dialog).toContainText('They are signed out and cannot sign in again');

		const release = await holdAction(page, '/admin', 'banUser');
		await dialog.getByRole('button', { name: 'Ban user' }).click();
		await expect(dialog).toBeHidden();
		// Confirming must `requestSubmit()` the row's form: ConfirmSubmit.svelte,
		// "Don't use `submit()`: it bypasses both" (use:enhance and Pending). Only
		// an enhanced submit marks the trigger busy, its spinner ("Loading")
		// replacing the icon, and leaves the admin on /admin.
		await expect(row.getByRole('button', { name: 'Loading Ban' })).toBeDisabled();
		release();

		await expect(toast(page, 'User banned')).toBeVisible();
		await expect(page).toHaveURL('/admin');
		await expect(row.getByRole('button', { name: 'Unban', exact: true })).toBeVisible();

		// `banUser` deletes the target's sessions (admin/+page.server.ts: "without
		// this a banned user kept every session they already had"), and
		// hooks.server.ts refuses a banned user's session anyway. Either one signs
		// them out, so this checks the outcome, not which of the two did it.
		await target.goto('/contribute');
		await expect(target).toHaveURL('/login?redirect=%2Fcontribute');
		await expect(target.getByRole('heading', { name: 'Sign in/Sign up' })).toBeVisible();
	});

	test('the confirmation opens on the dialog, so a stray Enter bans nobody', async ({ page }) => {
		// ConfirmSubmit.svelte: "bits-ui focuses the dialog itself on open, so a
		// stray Enter does nothing". On USERS.apiTarget, whom this file owns and no
		// test signs in as, so a regression here can't ban anyone another test needs.
		const posts: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST') posts.push(request.url());
		});

		await gotoReady(page, '/admin');
		const row = await userRow(page, USERS.apiTarget.email);
		await row.getByRole('button', { name: 'Ban', exact: true }).click();
		const dialog = confirmDialog(page);
		await expect(dialog).toBeFocused();
		await page.keyboard.press('Enter');

		// "Cancel first, so the first Tab reaches it rather than the action."
		await page.keyboard.press('Tab');
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(dialog).toBeHidden();

		// A submit starts its fetch synchronously, so a POST from the first Enter
		// would already be on the list.
		expect(posts).toEqual([]);
		await expect(row.getByRole('button', { name: 'Ban', exact: true })).toBeVisible();
	});

	test('unbanning needs no confirmation, and the kept session works again', async ({
		page,
		as
	}) => {
		const { name, email } = USERS.unbanTarget;

		// Seeded banned with its session kept, so for now hooks.server.ts treats
		// that session as signed out ("whatever sessions they still hold").
		const before = await as('unbanTarget');
		await before.goto('/profile');
		await expect(before).toHaveURL('/login');

		await gotoReady(page, '/admin');
		const row = await userRow(page, email);
		const release = await holdAction(page, '/admin', 'unbanUser');
		await row.getByRole('button', { name: 'Unban', exact: true }).click();
		// The click submits at once: the button is busy and no dialog opened.
		await expect(row.getByRole('button', { name: 'Loading Unban' })).toBeDisabled();
		await expect(confirmDialog(page)).toHaveCount(0);
		release();

		await expect(toast(page, 'User unbanned')).toBeVisible();
		await expect(row.getByRole('button', { name: 'Ban', exact: true })).toBeVisible();

		// The same seeded session, in a fresh context: `(reg)` pages are
		// browser-cached, and `before` has already been sent away from /profile.
		const after = await as('unbanTarget');
		await gotoReady(after, '/profile');
		await expect(after).toHaveURL('/profile');
		await expect(after.getByRole('heading', { name })).toBeVisible();
	});
});
