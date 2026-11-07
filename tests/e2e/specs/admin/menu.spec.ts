import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The admin menu (src/routes/admin/+page.svelte): one link per panel, each its
 * own page with its own load, and a way back from each. Reads only.
 */

test.use({ role: 'admin' });

/** Each panel's link text on the menu, its URL, and its page heading. */
const PANELS = [
	{ link: 'Users', path: '/admin/users', heading: 'Users' },
	{ link: 'Activity log', path: '/admin/log', heading: 'Activity log' },
	{ link: 'Badges', path: '/admin/badges', heading: 'Badges' },
	{ link: 'Search index', path: '/admin/search-index', heading: 'Search index' }
] as const;

test('the admin menu links to every panel, and each links back', async ({ page }) => {
	await gotoReady(page, '/admin');
	const menu = page.getByRole('navigation', { name: 'Admin panels' });
	await expect(menu.getByRole('link')).toHaveCount(PANELS.length);

	for (const panel of PANELS) {
		// Anchored: the link's name also holds its description.
		await menu.getByRole('link', { name: new RegExp(`^${panel.link}`) }).click();
		await expect(page).toHaveURL(panel.path);
		await expect(page.getByRole('heading', { level: 1, name: panel.heading })).toBeVisible();

		await page.getByRole('link', { name: 'Back to admin' }).click();
		await expect(page).toHaveURL('/admin');
	}
});
