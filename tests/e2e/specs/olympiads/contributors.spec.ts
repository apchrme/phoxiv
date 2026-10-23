import type { Locator, Page } from '@playwright/test';
import { CREDITS, USERS } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The olympiad page's contributors list: a button beside "Back to olympiads"
 * that opens, in a popover, everyone credited with one of the olympiad's
 * files, most uploads first. ContributorsButton.svelte.
 *
 * Reads the frozen CREDITS olympiads only. Writes nothing.
 */

/** The page's back link and the contributors trigger, which share one row. */
function backLink(page: Page): Locator {
	return page.getByRole('link', { name: 'Back to olympiads' });
}

function trigger(page: Page): Locator {
	return page.getByRole('button', { name: 'Contributors', exact: true });
}

/**
 * Opens the list. The popover is portalled and has no role of its own;
 * `data-popover-content` is bits-ui's hook (as in mobile/search.spec.ts).
 */
async function openList(page: Page, olympiad: string): Promise<Locator> {
	await gotoReady(page, `/olympiads/${olympiad}`);
	await trigger(page).click();
	return page.locator('[data-popover-content]');
}

test('the trigger sits on the back link’s row, at its far end', async ({ page }) => {
	await gotoReady(page, `/olympiads/${CREDITS.olympiad}`);
	// The row is the back link's parent, so both must be in it.
	const row = backLink(page).locator('..');
	await expect(row.getByRole('button', { name: 'Contributors', exact: true })).toBeVisible();

	const [back, button, box] = await Promise.all([
		backLink(page).boundingBox(),
		trigger(page).boundingBox(),
		row.boundingBox()
	]);
	// One line: their vertical centres agree.
	expect(Math.abs(back!.y + back!.height / 2 - (button!.y + button!.height / 2))).toBeLessThan(1);
	// The link at the start, the trigger flush with the end.
	expect(back!.x).toBeLessThan(box!.x + 1);
	expect(box!.x + box!.width - (button!.x + button!.width)).toBeLessThan(1);
});

test('lists credited uploaders, most uploads first, and nobody else', async ({ page }) => {
	const list = await openList(page, CREDITS.olympiad);
	const rows = list.getByRole('listitem');
	// Counts span both years and both file tables. USERS.banned uploaded one of
	// these files too, and must not be listed.
	await expect(rows).toHaveText([
		new RegExp(`${USERS.creditTop.name}\\s*3 files$`),
		new RegExp(`${USERS.creditAdmin.name}\\s*1 file$`)
	]);
	await expect(list).not.toContainText(USERS.banned.name);
	await expect(list.getByRole('link', { name: 'Meet the team' })).toHaveAttribute('href', '/team');
});

test('an olympiad whose files are all uncredited says so', async ({ page }) => {
	const list = await openList(page, CREDITS.uncredited);
	await expect(list.getByText('No credited uploads yet')).toBeVisible();
	await expect(list.getByRole('listitem')).toHaveCount(0);
});

test('a failed fetch shows an error, not an empty list', async ({ page }) => {
	await page.route(`**/api/olympiads/${CREDITS.olympiad}/contributors`, (route) =>
		route.fulfill({ status: 500, body: 'boom' })
	);
	const list = await openList(page, CREDITS.olympiad);
	await expect(list.getByText("Couldn't load the contributors")).toBeVisible();
	await expect(list.getByText('No credited uploads yet')).toBeHidden();
});
