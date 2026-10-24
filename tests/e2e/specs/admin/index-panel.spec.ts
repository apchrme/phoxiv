import type { APIRequestContext, Page, Response } from '@playwright/test';
import { FILE_URLS, PHRASES } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { confirmDialog, gotoReady, toast } from '../../support/ui';

/*
 * The admin Index tab (src/routes/admin/IndexPanel.svelte): its counts load only
 * once the tab is opened, and each maintenance action is one POST followed by
 * one refetch of the counts, then nothing more. IndexPanel.svelte and
 * admin/reindex/+server.ts both record why: "a self-resubmitting form in this
 * panel once looped forever".
 *
 * The only spec that writes the global FTS index (docs/testing.md, "Seed data"),
 * so the file runs serially: Rebuild and Merge rewrite the index, and Prune
 * deletes the seeded orphan row (ORPHAN_URL in fixtures/seed-data.ts), which is
 * why the second prune must find nothing. The prune counts are global, so the
 * file runs in its own `index` project, after every desktop spec: a file delete
 * leaves its text row orphaned for a moment, and a prune landing then counted it.
 */

test.describe.configure({ mode: 'serial' });
test.use({ role: 'admin' });

/** The endpoint the panel fetches its counts from. Never shared-cached. */
const STATS = '/admin/index-stats';

function isStats(response: Response): boolean {
	return new URL(response.url()).pathname === STATS;
}

/** What the page has sent: counts fetches by method, and `/admin` action POSTs by `?/name`. */
type Sent = { stats: string[]; posts: string[] };

/** Records every counts fetch and action POST the page sends from now on. */
function track(page: Page): Sent {
	const sent: Sent = { stats: [], posts: [] };
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.pathname === STATS) sent.stats.push(request.method());
		else if (url.pathname === '/admin' && request.method() === 'POST') sent.posts.push(url.search);
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

/** Opens `/admin` on the Index tab and waits for the counts its first open fetches. */
async function openIndexTab(page: Page): Promise<void> {
	await gotoReady(page, '/admin');
	const counts = page.waitForResponse(isStats);
	await page.getByRole('tab', { name: 'Index' }).click();
	expect((await counts).status()).toBe(200);
	await expect(page.getByText(/\d+ files in the archive/)).toBeVisible();
}

/**
 * Presses a maintenance button and waits for the action's answer and for the
 * counts refetch its `onDone` starts. `confirm` is the title of the dialog the
 * button opens first, for Prune.
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

test.describe('the admin Index tab', () => {
	test('fetches its counts when first opened, not on page load', async ({ page }) => {
		const sent = track(page);
		await gotoReady(page, '/admin');

		// +page.svelte: "bits-ui mounts every tab's content at once, so without this
		// gate `IndexPanel` would run its expensive stats fetch on every page load".
		// Hydration has finished, so a panel mounted on load would be in the DOM
		// (hidden) and its fetch already sent.
		await expect(page.getByRole('tab', { name: 'Users' })).toHaveAttribute('aria-selected', 'true');
		await expect(page.getByText('Full-text index')).toHaveCount(0);
		expect(sent.stats).toEqual([]);

		const counts = page.waitForResponse(isStats);
		await page.getByRole('tab', { name: 'Index' }).click();
		expect((await counts).status()).toBe(200);
		await expect(page.getByText(/\d+ files in the archive/)).toBeVisible();

		// "Stays true, so re-entering doesn't refetch" (+page.svelte).
		await page.getByRole('tab', { name: 'Log' }).click();
		await expect(page.getByText(/\d+ files in the archive/)).toBeHidden();
		await page.getByRole('tab', { name: 'Index' }).click();
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
		await openIndexTab(page);

		await runMaintenance(page, 'Rebuild index', 'ensureIndex');
		await expect(toast(page, 'Search index rebuilt')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET', 'GET'], posts: ['?/ensureIndex'] });
		expect(await searchFiles(request, PHRASES.alphaPaper)).toEqual(before);
	});

	test('Merge segments sends one POST and refetches the counts once', async ({ page }) => {
		const sent = track(page);
		await openIndexTab(page);

		await runMaintenance(page, 'Merge segments', 'optimizeIndex');
		await expect(toast(page, 'Index segments merged')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET', 'GET'], posts: ['?/optimizeIndex'] });
	});

	test('Prune orphans removes the seeded orphan row, in one POST and one refetch', async ({
		page
	}) => {
		const sent = track(page);
		await openIndexTab(page);

		// The seed's one orphan, ORPHAN_URL. The toast names the count the action
		// returns (+page.svelte's `pruneIndex` toast).
		await runMaintenance(page, 'Prune orphans', 'pruneIndex', PRUNE_DIALOG);
		await expect(toast(page, 'Removed 1 orphaned index row')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET', 'GET'], posts: ['?/pruneIndex'] });
	});

	test('a second Prune orphans finds nothing to remove', async ({ page }) => {
		// Runs after the prune above (the file is serial), which used up the orphan.
		const sent = track(page);
		await openIndexTab(page);

		await runMaintenance(page, 'Prune orphans', 'pruneIndex', PRUNE_DIALOG);
		await expect(toast(page, 'No orphaned index rows to remove')).toBeVisible();

		await expectSettled(page, sent, { stats: ['GET', 'GET'], posts: ['?/pruneIndex'] });
	});

	test('Refresh refetches the counts once and posts nothing', async ({ page }) => {
		const sent = track(page);
		await openIndexTab(page);

		const refetched = page.waitForResponse(isStats);
		await page.getByRole('button', { name: 'Refresh' }).click();
		expect((await refetched).status()).toBe(200);
		await expect(page.getByRole('button', { name: 'Refresh' })).toBeEnabled();

		await expectSettled(page, sent, { stats: ['GET', 'GET'], posts: [] });
	});
});
