import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The mobile nav: below `md` the desktop nav is hidden, and the menu button in
 * the glass pill opens AppSidebar.svelte as a sheet. Every link in it closes
 * the sheet as it navigates.
 *
 * Reads no seed rows beyond the pages themselves. Writes nothing.
 */

test.describe('the mobile nav', () => {
	test('the menu opens the sidebar, and a tap on a link reaches its page', async ({ page }) => {
		await gotoReady(page, '/privacy');

		// The desktop nav's links are hidden at this width; only the sheet has them.
		await expect(page.getByRole('link', { name: 'olympiads', exact: true })).toBeHidden();

		await page.getByRole('button', { name: 'Toggle Sidebar' }).tap();
		// The vendored sidebar titles its sheet "Sidebar" (sr-only).
		const sheet = page.getByRole('dialog', { name: 'Sidebar' });
		await expect(sheet).toBeVisible();
		await expect(sheet).toBeInViewport();
		// Signed out: the header offers the log-in link.
		await expect(sheet.getByRole('link', { name: 'Log in' })).toBeVisible();
		// The current page is marked.
		await expect(sheet.getByRole('link', { name: 'privacy policy' })).toHaveAttribute(
			'data-active',
			'true'
		);

		await sheet.getByRole('link', { name: 'olympiads', exact: true }).tap();
		await expect(page).toHaveURL('/olympiads');
		await expect(sheet).toBeHidden();
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});
});

test.describe('the mobile nav, signed in', () => {
	test.use({ role: 'user' });

	test('the sheet links the profile instead of the log-in', async ({ page }) => {
		await gotoReady(page, '/olympiads');
		await page.getByRole('button', { name: 'Toggle Sidebar' }).tap();
		const sheet = page.getByRole('dialog', { name: 'Sidebar' });
		await expect(sheet).toBeVisible();
		await expect(sheet.getByRole('link', { name: 'Log in' })).toHaveCount(0);

		await sheet.getByRole('link', { name: /Uma User/ }).tap();
		await expect(page).toHaveURL('/profile');
		await expect(sheet).toBeHidden();
	});
});
