import type { Locator, Page } from '@playwright/test';
import { USERS } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * /team: every admin and contributor, most uploads first, from `/api/team`.
 *
 * Reads the frozen CREDITS rows and USERS. Other specs upload as USERS.admin
 * and USERS.contributor while this runs, so only the relative order of the
 * credit accounts, whose counts nothing changes, is asserted.
 */

/** The team list's rows. */
function rows(page: Page): Locator {
	return page.getByRole('main').getByRole('listitem');
}

/** The row naming `name`. */
function row(page: Page, name: string): Locator {
	return rows(page).filter({ hasText: name });
}

test('lists admins and contributors, most uploads first', async ({ page }) => {
	await gotoReady(page, '/team');
	await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();

	await expect(row(page, USERS.creditTop.name)).toContainText('3 files');
	await expect(row(page, USERS.creditTop.name)).toContainText('Contributor');
	await expect(row(page, USERS.creditAdmin.name)).toContainText('1 file');
	await expect(row(page, USERS.creditAdmin.name)).toContainText('Admin');
	// No uploads, but on the team all the same.
	await expect(row(page, USERS.creditIdle.name)).toContainText('0 files');

	const names = await rows(page).allTextContents();
	const at = (name: string) => names.findIndex((text) => text.includes(name));
	expect(at(USERS.creditTop.name)).toBeLessThan(at(USERS.creditAdmin.name));
	expect(at(USERS.creditAdmin.name)).toBeLessThan(at(USERS.creditIdle.name));
});

test('leaves out plain users and banned accounts', async ({ page }) => {
	await gotoReady(page, '/team');
	await expect(row(page, USERS.creditTop.name)).toBeVisible();
	await expect(row(page, USERS.user.name)).toHaveCount(0);
	// A banned contributor, credited with one of CREDITS's files.
	await expect(row(page, USERS.banned.name)).toHaveCount(0);
});

test('a failed fetch shows an error, not an empty team', async ({ page }) => {
	await page.route('**/api/team', (route) => route.fulfill({ status: 500, body: 'boom' }));
	await gotoReady(page, '/team');
	await expect(page.getByText("Couldn't load the team")).toBeVisible();
	await expect(rows(page)).toHaveCount(0);
});

test('the nav links to it', async ({ page }) => {
	await gotoReady(page, '/');
	// The desktop nav keeps secondary links behind "more".
	await page.getByRole('button', { name: 'more', exact: true }).click();
	await page.getByRole('link', { name: 'team', exact: true }).click();
	await expect(page).toHaveURL('/team');
});
