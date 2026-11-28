import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { ANNOUNCEMENTS } from '../../fixtures/seed-data';
import { sessionCookie } from '../../support/auth';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The navbar bell and /announcements (src/lib/notifications.svelte.ts): which
 * announcements count as seen, signed out (localStorage) and signed in (the
 * account), and the merge from one to the other at sign-in.
 *
 * Reads the frozen ANNOUNCEMENTS. Owns USERS.announcementReader and
 * USERS.announcementMerger, whose seen sets it writes. admin/announcements.spec.ts
 * posts announcements while this runs, so everything here is found by title and
 * no test asserts the unread total.
 */

const { older, newest } = ANNOUNCEMENTS;

/** localStorage key of the signed-out seen set. */
const KEY = 'phoxiv:announcements-read';

/** Opens the bell and returns its panel (portalled, so found from `page`). */
async function openBell(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: /^Notifications/ }).click();
	const panel = page.getByRole('dialog');
	await expect(panel.getByText('Notifications', { exact: true })).toBeVisible();
	return panel;
}

/** One announcement in the bell. */
function bellItem(panel: Locator, title: string): Locator {
	return panel.getByRole('listitem').filter({ hasText: title });
}

/** The "New" mark on an item or article. */
function newMark(scope: Locator): Locator {
	return scope.getByText('New', { exact: true });
}

/** What the browser has stored as seen, or `null`. */
function stored(page: Page): Promise<string | null> {
	return page.evaluate((key) => localStorage.getItem(key), KEY);
}

/** The account's seen set among the bell's announcements. */
async function accountRead(api: APIRequestContext): Promise<number[]> {
	const response = await api.get('/notifications');
	expect(response.status()).toBe(200);
	return (await response.json()).read;
}

test.describe('the notifications bell', () => {
	test('signed out, what was seen is kept in this browser only', async ({ page, as }) => {
		await gotoReady(page, '/about');
		let panel = await openBell(page);
		await expect(newMark(bellItem(panel, newest.title))).toBeVisible();
		await expect(newMark(bellItem(panel, older.title))).toBeVisible();
		// Opening marks everything shown as seen.
		await expect.poll(() => stored(page)).toContain(String(newest.id));
		expect(await stored(page)).toContain(String(older.id));

		// Still marked "New" while open, so a reader can tell what was new.
		await expect(newMark(bellItem(panel, newest.title))).toBeVisible();

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
		panel = await openBell(page);
		await expect(bellItem(panel, newest.title)).toBeVisible();
		await expect(newMark(bellItem(panel, newest.title))).toHaveCount(0);

		// Another browser has its own, empty, seen set.
		const other = await as(null);
		await gotoReady(other, '/about');
		await expect(newMark(bellItem(await openBell(other), newest.title))).toBeVisible();
	});

	test('signed in, what was seen is kept on the account', async ({ as, apiAs }) => {
		const page = await as('announcementReader');
		await gotoReady(page, '/about');
		const panel = await openBell(page);
		await expect(newMark(bellItem(panel, newest.title))).toBeVisible();

		const api = await apiAs('announcementReader');
		await expect
			.poll(() => accountRead(api))
			.toEqual(expect.arrayContaining([older.id, newest.id]));
		// Signed in, nothing goes to storage.
		expect(await stored(page)).toBeNull();

		// A second browser signed in as the same user sees them as seen.
		const other = await as('announcementReader');
		await gotoReady(other, '/about');
		const otherPanel = await openBell(other);
		await expect(bellItem(otherPanel, newest.title)).toBeVisible();
		await expect(newMark(bellItem(otherPanel, newest.title))).toHaveCount(0);
	});

	test('signing in merges what this browser saw into the account', async ({
		page,
		context,
		apiAs
	}) => {
		await gotoReady(page, '/about');
		await openBell(page);
		await expect.poll(() => stored(page)).toContain(String(newest.id));

		const api = await apiAs('announcementMerger');
		expect(await accountRead(api)).not.toContain(newest.id);

		// Signs this browser in, as finishing the OAuth flow would.
		await context.addCookies([sessionCookie('announcementMerger')]);
		await gotoReady(page, '/olympiads');

		await expect
			.poll(() => accountRead(api))
			.toEqual(expect.arrayContaining([older.id, newest.id]));
		// Merged, so the browser's copy is dropped.
		await expect.poll(() => stored(page)).toBeNull();
	});

	test('the endpoint refuses to mark anything signed out, or a malformed body', async ({
		apiAs
	}) => {
		const anonymous = await apiAs(null);
		const refused = await anonymous.post('/notifications', { data: { ids: [newest.id] } });
		expect(refused.status()).toBe(401);
		// Signed out, the list is still served, with no seen set.
		const listed = await anonymous.get('/notifications');
		expect(listed.status()).toBe(200);
		const body = await listed.json();
		expect(body.read).toBeNull();
		expect(body.announcements.map((a: { id: number }) => a.id)).toContain(newest.id);

		// An owned user, though every body below is refused before anything is written.
		const api = await apiAs('announcementMerger');
		for (const data of [
			{},
			{ ids: [] },
			{ ids: ['1'] },
			{ ids: [0] },
			{ ids: [1.5] },
			{ ids: Array.from({ length: 101 }, (_, i) => i + 1) }
		]) {
			const response = await api.post('/notifications', { data });
			expect(response.status(), JSON.stringify(data).slice(0, 40)).toBe(400);
		}
	});
});

test.describe('/announcements', () => {
	test('lists every announcement with its Markdown, and is reached from the bell', async ({
		page
	}) => {
		await gotoReady(page, '/about');
		const panel = await openBell(page);
		await panel.getByRole('link', { name: 'View all announcements' }).click();
		await expect(page).toHaveURL(/\/announcements$/);
		// Navigating closes the bell.
		await expect(panel).toBeHidden();

		const article = page.getByRole('article', { name: newest.title });
		await expect(article.locator('strong')).toHaveText('the rules');
		await expect(article.getByRole('link', { name: 'the about page' })).toHaveAttribute(
			'href',
			'/about'
		);
		await expect(page.getByRole('article', { name: older.title })).toBeVisible();
		// The bell already marked them seen.
		await expect(newMark(article)).toHaveCount(0);
	});

	test('a visit marks what it shows as seen', async ({ page }) => {
		await gotoReady(page, '/announcements');
		const article = page.getByRole('article', { name: newest.title });
		await expect(newMark(article)).toBeVisible();
		await expect.poll(() => stored(page)).toContain(String(newest.id));

		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
		await expect(article).toBeVisible();
		await expect(newMark(article)).toHaveCount(0);
		// And so does the bell.
		await expect(newMark(bellItem(await openBell(page), newest.title))).toHaveCount(0);
	});
});
