import type { APIRequestContext, Page, Response } from '@playwright/test';
import { FILE_URLS, PHRASES } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { confirmDialog, gotoReady, toast } from '../../support/ui';

/*
 * The admin search-index page (src/routes/admin/search-index/). Each maintenance
 * action must be one POST and one reload of the page data, then nothing more.
 * IndexPanel.svelte and admin/reindex/+server.ts both record why: "a
 * self-resubmitting form in this panel once looped forever".
 *
 * The only spec that writes the global FTS index (docs/testing.md, "Seed data"),
 * so it runs serially, in its own `index` project (support/config.ts says why).
 * Prune deletes the seeded orphan (ORPHAN_URL), so the second prune finds nothing.
 */

test.describe.configure({ mode: 'serial' });
test.use({ role: 'admin' });

const PAGE = '/admin/search-index';

/**
 * The client-side fetch of the page's load data, which carries the counts. The
 * first visit is server-rendered, so only navigations, Refresh and the reload
 * after each action send it.
 */
const STATS = `${PAGE}/__data.json`;

function isStats(response: Response): boolean {
	return new URL(response.url()).pathname === STATS;
}

/** What the page has sent: counts fetches by method, and action POSTs by `?/name`. */
type Sent = { stats: string[]; posts: string[] };

/** Records every counts fetch and action POST the page sends from now on. */
function track(page: Page): Sent {
	const sent: Sent = { stats: [], posts: [] };
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.pathname === STATS) sent.stats.push(request.method());
		else if (url.pathname === PAGE && request.method() === 'POST') sent.posts.push(url.search);
	});
	return sent;
}

/**
 * Waits a bounded second, then checks that the page sent exactly `expected` in
 * all. The one fixed wait in this file: the regression it guards is a loop,
 * which shows only as requests that keep coming after the answer.
 */
async function expectSettled(page: Page, sent: Sent, expected: Sent): Promise<void> {
	// eslint-disable-next-line playwright/no-wait-for-timeout -- IndexPanel.svelte: "a self-resubmitting form in this panel once looped forever"
	await page.waitForTimeout(1000);
	expect(sent).toEqual(expected);
}

/** Opens the page, server-rendered with its counts. */
async function openIndex(page: Page): Promise<void> {
	await gotoReady(page, PAGE);
	await expect(page.getByText(/\d+ files in the archive/)).toBeVisible();
}

/**
 * Presses a maintenance button and waits for the action's answer and for the
 * reload of the page data that follows it. `confirm` is the title of the dialog
 * the button opens first, for Prune.
 */
async function runMaintenance(
	page: Page,
	button: string,
	action: string,
	confirm?: string
): Promise<void> {
	const answered = page.waitForResponse(
		(r) => r.request().method() === 'POST' && new URL(r.url()).search === `?/${action}`
	);
	const refetched = page.waitForResponse(isStats);
	await page.getByRole('button', { name: button }).click();
	if (confirm) {
		const dialog = confirmDialog(page);
		await expect(dialog).toContainText(confirm);
		// The confirming button shares the trigger's label, so find it in the dialog.
		await dialog.getByRole('button', { name: button }).click();
		await expect(dialog).toBeHidden();
	}
	expect((await answered).status()).toBe(200);
	expect((await refetched).status()).toBe(200);
	// The button is disabled while its submission is pending, and only then.
	await expect(page.getByRole('button', { name: button })).toBeEnabled();
}

/**
 * Deep search's results for `q`. `no-cache` makes the `sharedCache` hook skip
 * the shared cache, which would otherwise answer with the body from before a
 * write.
 */
async function searchFiles(request: APIRequestContext, q: string): Promise<unknown[]> {
	const response = await request.get(`/api/search/files?${new URLSearchParams({ q })}`, {
		headers: { 'cache-control': 'no-cache' }
	});
	expect(response.status()).toBe(200);
	return (await response.json()).results;
}

const PRUNE_DIALOG = 'Prune orphaned index rows?';

test.describe('the admin search-index page', () => {
	test('the menu does not preload its counts on hover; opening it fetches them once', async ({
		page
	}) => {
		const sent = track(page);
		await gotoReady(page, '/admin');

		// admin/+page.svelte: "the search index's load reads thousands of D1 rows,
		// so that link waits for a tap". The app preloads every other link on hover.
		const link = page.getByRole('link', { name: /Search index/ });
		await link.hover();
		await expectSettled(page, sent, { stats: [], posts: [] });

		const counts = page.waitForResponse(isStats);
		await link.click();
		expect((await counts).status()).toBe(200);
		await expect(page).toHaveURL(PAGE);
		await expect(page.getByText(/\d+ files in the archive/)).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET'], posts: [] });
	});

	test('Rebuild index sends one POST, refetches the counts once, and keeps results', async ({
		page,
		request
	}) => {
		// A frozen phrase in one seeded file. Rebuild refills the index from the
		// stored text, so a search must answer the same before and after.
		const before = await searchFiles(request, PHRASES.alphaPaper);
		expect(before).toEqual([
			expect.objectContaining({ file: expect.objectContaining({ url: FILE_URLS.alphaPaper }) })
		]);

		const sent = track(page);
		await openIndex(page);

		await runMaintenance(page, 'Rebuild index', 'ensureIndex');
		await expect(toast(page, 'Search index rebuilt')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET'], posts: ['?/ensureIndex'] });
		expect(await searchFiles(request, PHRASES.alphaPaper)).toEqual(before);
	});

	test('Merge segments sends one POST and refetches the counts once', async ({ page }) => {
		const sent = track(page);
		await openIndex(page);

		await runMaintenance(page, 'Merge segments', 'optimizeIndex');
		await expect(toast(page, 'Index segments merged')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET'], posts: ['?/optimizeIndex'] });
	});

	test('Prune orphans removes the seeded orphan row, in one POST and one refetch', async ({
		page
	}) => {
		const sent = track(page);
		await openIndex(page);

		// The seed's one orphan, ORPHAN_URL. The toast names the count the action
		// returns (+page.svelte's `pruneIndex` toast).
		await runMaintenance(page, 'Prune orphans', 'pruneIndex', PRUNE_DIALOG);
		await expect(toast(page, 'Removed 1 orphaned index row')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET'], posts: ['?/pruneIndex'] });
	});

	test('a second Prune orphans finds nothing to remove', async ({ page }) => {
		// Runs after the prune above (the file is serial), which used up the orphan.
		const sent = track(page);
		await openIndex(page);

		await runMaintenance(page, 'Prune orphans', 'pruneIndex', PRUNE_DIALOG);
		await expect(toast(page, 'No orphaned index rows to remove')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET'], posts: ['?/pruneIndex'] });
	});

	test('Refresh refetches the counts once and posts nothing', async ({ page }) => {
		const sent = track(page);
		await openIndex(page);

		const refetched = page.waitForResponse(isStats);
		await page.getByRole('button', { name: 'Refresh' }).click();
		expect((await refetched).status()).toBe(200);
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();

		await expectSettled(page, sent, { stats: ['GET'], posts: [] });
	});
});
