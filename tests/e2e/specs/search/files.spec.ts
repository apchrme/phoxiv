import type { Locator, Page } from '@playwright/test';
import { FILE_URLS, PHRASES, SCRIPT_IN_TEXT } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, openSearch } from '../../support/ui';

/*
 * The ⌘K dialog in files mode (deep search): what the panel shows before, during
 * and after a search, and what a result is. docs/search.md, "What the panel can
 * show", has the branch order these tests walk through.
 *
 * Reads frozen seed rows only: the alpha 2019 documents and their indexed text.
 */

/** Any page will do: the dialog is mounted by the root layout. */
const START = '/privacy';

/** The texts of the panel's states, as the files panel in GlobalSearch.svelte renders them. */
const EXPLAINER = 'Search the text inside every uploaded document.';
const TOO_SHORT = 'Type at least 5 characters.';
const SEARCHING = 'Searching inside files…';
const NO_MATCHES = 'No files contain that phrase';

/**
 * Opens the dialog and switches it to the Files tab. Returns the dialog and its
 * search box, which the tab focuses.
 */
async function openFilesMode(page: Page): Promise<{ dialog: Locator; box: Locator }> {
	await gotoReady(page, START);
	await openSearch(page);
	await page.getByRole('tab', { name: 'Files' }).click();
	// The title follows the mode, so this also proves the switch happened.
	const dialog = page.getByRole('dialog', { name: 'Search inside files' });
	await expect(dialog).toBeVisible();
	const box = dialog.getByRole('searchbox');
	await expect(box).toBeFocused();
	return { dialog, box };
}

/** The `q` of every `/api/search/files` request the page sends, in order. */
function recordDeepSearches(page: Page): string[] {
	const queries: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.pathname === '/api/search/files') queries.push(url.searchParams.get('q') ?? '');
	});
	return queries;
}

function isDeepSearch(url: string): boolean {
	return new URL(url).pathname === '/api/search/files';
}

/*
 * The debounce tests run on Playwright's fake clock, so "during the debounce"
 * lasts as long as the test needs and "after it" is exact, with no fixed wait.
 * The clock is installed before the page loads but keeps running in real time
 * through load and hydration; it is paused only once the dialog is open, so
 * only the debounce runs on fake time.
 */
const CLOCK_START = new Date('2026-01-01T00:00:00Z');
const CLOCK_PAUSE = new Date('2026-01-01T01:00:00Z');
/** Well past DEEP_DEBOUNCE_MS (250; `$lib/search` can't be imported here). */
const PAST_THE_DEBOUNCE = 1000;

test.describe('⌘K files mode', () => {
	test('an empty box, and one cleared after a search, show the explainer', async ({
		page,
		context
	}) => {
		const { dialog, box } = await openFilesMode(page);
		const rows = dialog.locator('[data-result-index]');
		// The input row's spinner. The panel's failure branch comes before the
		// explainer, so the explainer showing rules a failure out; its loading and
		// "no matches" branches come after, so the spinner is the one sign left of a
		// search pending.
		const spinner = dialog.getByRole('status', { name: 'Loading' });

		// "`null` means none, never a string: any string could equal a live key (the
		// empty input's is `"\n"`), and a marker equal to the live key shows the
		// panel loading or failed before anything was typed" (deep-search.svelte.ts).
		await expect(dialog.getByText(EXPLAINER)).toBeVisible();
		await expect(dialog.getByText(TOO_SHORT)).toBeHidden();
		await expect(spinner).toBeHidden();

		await box.fill(PHRASES.alphaPaper);
		await expect(rows).toHaveCount(1);

		// Cleared: the explainer again, with no rows and no spinner.
		await box.fill('');
		await expect(dialog.getByText(EXPLAINER)).toBeVisible();
		await expect(rows).toHaveCount(0);
		await expect(dialog.getByText(TOO_SHORT)).toBeHidden();
		await expect(spinner).toBeHidden();

		// `deep.results` still holds the last list, and the explainer's branch hides
		// it whatever `visibleDeepResults` holds, so only the keyboard can tell:
		// "the keyboard must not address rows that aren't rendered" (GlobalSearch.svelte,
		// "The file rows actually on screen"). Enter in the empty box opens nothing.
		await box.press('Enter');
		// Positive control: the same query is answered from the session cache, so
		// its Enter opens a tab at once, after any the first Enter opened.
		await box.fill(PHRASES.alphaPaper);
		await expect(rows).toHaveCount(1);
		const opened = context.waitForEvent('page');
		await box.press('Enter');
		await opened;
		expect(context.pages(), 'this tab and the control’s, none from the empty box').toHaveLength(2);
	});

	test('4 characters ask for a fifth and send nothing; 5 characters search', async ({ page }) => {
		const queries = recordDeepSearches(page);
		await page.clock.install({ time: CLOCK_START });
		const { dialog, box } = await openFilesMode(page);
		await page.clock.pauseAt(CLOCK_PAUSE);

		// "Below this, no D1 read happens at all" (MIN_DEEP_QUERY_LENGTH, $lib/search.ts).
		await box.fill('quok');
		await expect(dialog.getByText(EXPLAINER)).toBeVisible();
		await expect(dialog.getByText(TOO_SHORT)).toBeVisible();
		// Not even pending: a short query is never scheduled.
		await expect(dialog.getByRole('status', { name: 'Loading' })).toBeHidden();
		// Long enough for any debounced request to have been sent. None may be: the
		// fifth character's request, below, would otherwise not be the first.
		await page.clock.runFor(PAST_THE_DEBOUNCE);

		const searched = page.waitForResponse((response) => isDeepSearch(response.url()));
		await box.fill('quokk');
		await expect(dialog.getByText(TOO_SHORT)).toBeHidden();
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		expect((await searched).status()).toBe(200);

		// The last word is a prefix, so "quokk" finds the "quokka" solution.
		await expect(dialog.locator('[data-result-index]')).toHaveCount(1);
		await expect(dialog.getByRole('link')).toHaveAttribute('href', FILE_URLS.alphaSolution);
		expect(queries).toEqual(['quokk']);
	});

	test('the first query reads "Searching inside files…" during the debounce', async ({ page }) => {
		const queries = recordDeepSearches(page);
		await page.clock.install({ time: CLOCK_START });
		const { dialog, box } = await openFilesMode(page);
		await page.clock.pauseAt(CLOCK_PAUSE);

		// "Marks `key` pending before the debounce starts. Otherwise, during the
		// debounce, the panel would show "No files contain that phrase." before
		// anything was asked" (DeepSearch.schedule, deep-search.svelte.ts). The clock
		// is paused, so this is the debounce, however long the assertions take.
		await box.fill(PHRASES.alphaPaper);
		await expect(dialog.getByText(SEARCHING)).toBeVisible();
		// The spinner replaces the magnifier in the input row.
		await expect(dialog.getByRole('status', { name: 'Loading' })).toBeVisible();
		await expect(dialog.getByText(NO_MATCHES)).toBeHidden();
		expect(queries).toEqual([]);

		const searched = page.waitForResponse((response) => isDeepSearch(response.url()));
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		await searched;

		await expect(dialog.locator('[data-result-index]')).toHaveCount(1);
		await expect(dialog.getByText(SEARCHING)).toBeHidden();
		await expect(dialog.getByRole('status', { name: 'Loading' })).toBeHidden();
		await expect(dialog.getByText(NO_MATCHES)).toBeHidden();
		expect(queries).toEqual([PHRASES.alphaPaper]);
	});

	test('a <script> in a snippet renders as text', async ({ page }) => {
		const { dialog, box } = await openFilesMode(page);

		// "Never `{@html}`: the text is an unescaped PDF body" (FileResultItem.svelte).
		await box.fill('which must stay text');
		const row = dialog.locator('[data-result-index]');
		await expect(row).toHaveCount(1);
		await expect(row).toContainText(SCRIPT_IN_TEXT);
		await expect(dialog.locator('script')).toHaveCount(0);

		// The matched words are still real <mark> elements beside it.
		await expect
			.poll(async () => (await row.locator('mark').allTextContents()).join(' ').toLowerCase())
			.toBe('which must stay text');
	});

	test('a result is a file: it lists its problem, and Enter opens it in a new tab', async ({
		page,
		context,
		blockedRequests
	}) => {
		const { dialog, box } = await openFilesMode(page);

		await box.fill(PHRASES.alphaSolution);
		const rows = dialog.locator('[data-result-index]');
		await expect(rows).toHaveCount(1);
		const row = rows.first();

		// The file, its olympiad and year, and the problem it is attached to.
		await expect(row.getByRole('link')).toHaveAttribute('href', FILE_URLS.alphaSolution);
		await expect(row.getByRole('link')).toHaveAttribute('target', '_blank');
		await expect(row.getByText('Solution', { exact: true })).toBeVisible();
		await expect(row.getByText('Alpha Physics Olympiad')).toBeVisible();
		await expect(row.getByText('2019', { exact: true })).toBeVisible();
		await expect(row.getByText('T1', { exact: true })).toBeVisible();

		// Only this tab's requests: `blockedRequests` also holds the new tab's.
		const fromThisTab: string[] = [];
		page.on('request', (request) => fromThisTab.push(request.url()));

		// Enter opens the file in a new tab; the dialog stays open so the reader can
		// come back to the list (FileResultItem.svelte). The CDN is unreachable from
		// the suite, so the new tab's load is blocked, which is all this needs.
		const opened = context.waitForEvent('page');
		await box.press('Enter');
		await opened;
		await expect.poll(() => blockedRequests).toContain(FILE_URLS.alphaSolution);

		// "with either, `window.open` always returns null, so the fallback ran on
		// every Enter and took this tab to the file too, closing the dialog"
		// (activateFocused, GlobalSearch.svelte). Both tabs ask for the file in the
		// same keydown, so by the time the new tab has, this one would have too.
		expect(fromThisTab).not.toContain(FILE_URLS.alphaSolution);
		await expect(dialog).toBeVisible();
		await expect(box).toHaveValue(PHRASES.alphaSolution);
		await expect(page).toHaveURL(START);
	});
});
