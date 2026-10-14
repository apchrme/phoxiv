import type { Locator, Page } from '@playwright/test';
import { FILES_PANEL } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, openSearch } from '../../support/ui';

/*
 * The ⌘K dialog in files mode, past the basics in search/files.spec.ts: the
 * session cache, the length limit, how the query ladder ranks a pasted
 * sentence, what a row says about its problems, the hidden problems panel, the
 * mode switch keeping problem filters, and a failed request. docs/search.md,
 * "What the panel can show", lists the branches.
 *
 * Reads the FILES_PANEL rows in seed-data.ts, which no spec writes. Every query
 * here matches only those documents, so no other spec's uploads can add a row.
 */

/** Any page will do: the dialog is mounted by the root layout. */
const START = '/privacy';

const { urls } = FILES_PANEL;

/** The texts of the panel's states, as GlobalSearch.svelte renders them. */
const SEARCHING = 'Searching inside files…';
const NO_MATCHES = 'No files contain that phrase';
const FAILED = "Couldn't search inside files";
const TOO_LONG = "That's too long to search inside files.";
/** MAX_DEEP_QUERY_LENGTH (`$lib/search` imports through `$lib`, so it can't be imported here). */
const MAX_LENGTH = 200;

/** Opens the dialog in problem mode and returns it and its search box. */
async function openDialog(page: Page): Promise<{ dialog: Locator; box: Locator }> {
	await gotoReady(page, START);
	const dialog = await openSearch(page);
	return { dialog, box: dialog.getByRole('searchbox') };
}

/** Switches an open dialog to the Files tab and returns the dialog by its new title. */
async function toFilesMode(page: Page): Promise<Locator> {
	await page.getByRole('tab', { name: 'Files' }).click();
	// The title follows the mode, so this also proves the switch happened.
	const dialog = page.getByRole('dialog', { name: 'Search inside files' });
	await expect(dialog).toBeVisible();
	return dialog;
}

async function openFilesMode(page: Page): Promise<{ dialog: Locator; box: Locator }> {
	const { box } = await openDialog(page);
	const dialog = await toFilesMode(page);
	await expect(box).toBeFocused();
	return { dialog, box };
}

/** The dialog's result rows, in either mode. `[data-result-index]` is the hook the shell scrolls by. */
function resultRows(scope: Locator): Locator {
	return scope.locator('[data-result-index]');
}

/** The file row whose label is exactly `label`. */
function fileRow(dialog: Locator, label: string): Locator {
	// `has` is matched inside each row, so the inner locator starts from the page.
	return resultRows(dialog).filter({ has: dialog.page().getByText(label, { exact: true }) });
}

/** The input row's spinner, shown while a search is pending. */
function spinner(dialog: Locator): Locator {
	return dialog.getByRole('status', { name: 'Loading' });
}

function isDeepSearch(url: URL): boolean {
	return url.pathname === '/api/search/files';
}

/** The `q` of every `/api/search/files` request the page sends, in order. */
function recordDeepSearches(page: Page): string[] {
	const queries: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (isDeepSearch(url)) queries.push(url.searchParams.get('q') ?? '');
	});
	return queries;
}

/**
 * Holds the page's deep searches from now on until the returned function is
 * called, so the in-flight window lasts as long as the assertions need.
 */
async function holdDeepSearches(page: Page): Promise<() => void> {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route(isDeepSearch, async (route) => {
		await released;
		await route.continue();
	});
	return release;
}

/** Ticks `topic` in the dialog's icon-only topic filter, then closes its menu. */
async function filterByTopic(page: Page, dialog: Locator, topic: string): Promise<void> {
	await dialog.getByRole('button', { name: 'Filter by topic' }).click();
	// The menu is portalled out of the dialog, so it is found from `page`.
	await page.getByRole('checkbox', { name: topic }).check();
	// Escape closes the innermost layer only: the menu, not the dialog.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toBeHidden();
	await expect(dialog).toBeVisible();
}

/*
 * Debounce-timed tests run on Playwright's fake clock, as in search/files.spec.ts:
 * installed before the page loads, running in real time through load and
 * hydration, and paused once the dialog is open. Then "during the debounce"
 * lasts as long as the assertions take, and `runFor` ends it exactly.
 */
const CLOCK_START = new Date('2026-01-01T00:00:00Z');
const CLOCK_PAUSE = new Date('2026-01-01T01:00:00Z');
/** Well past DEEP_DEBOUNCE_MS (250). */
const PAST_THE_DEBOUNCE = 1000;

test.describe('⌘K files mode: the panel', () => {
	test('typing on keeps the list, and a retyped query is served from the session cache', async ({
		page
	}) => {
		const queries = recordDeepSearches(page);
		await page.clock.install({ time: CLOCK_START });
		const { dialog, box } = await openFilesMode(page);
		await page.clock.pauseAt(CLOCK_PAUSE);
		const rows = resultRows(dialog);
		const paper = fileRow(dialog, 'Problems');

		const first = 'brachistochrone';
		const longer = 'brachistochrone challenge';
		await box.fill(first);
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		await expect(rows).toHaveCount(1);
		await expect(paper.getByRole('link')).toHaveAttribute('href', urls.paper);

		// Keep typing. "The key whose results are on screen. It trails the live key
		// while a newer request is in flight, so the panel doesn't blank on every
		// keystroke" (`#landed`, deep-search.svelte.ts). The clock is paused, so
		// this is the debounce of every keystroke but the first.
		const release = await holdDeepSearches(page);
		await box.pressSequentially(' challenge');
		await expect(rows).toHaveCount(1);
		await expect(paper).toBeVisible();
		await expect(dialog.getByText(SEARCHING)).toBeHidden();
		await expect(dialog.getByText(NO_MATCHES)).toBeHidden();
		expect(queries).toEqual([first]);

		// Debounce over: the request is sent and held on the wire. The list stays,
		// with the spinner in the input row.
		const sent = page.waitForRequest((request) => isDeepSearch(new URL(request.url())));
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		await sent;
		await expect(spinner(dialog)).toBeVisible();
		await expect(paper).toBeVisible();
		await expect(dialog.getByText(SEARCHING)).toBeHidden();

		release();
		await expect(spinner(dialog)).toBeHidden();
		await expect(rows).toHaveCount(1);
		expect(queries).toEqual([first, longer]);

		// Retyped: "A cache hit is shown synchronously, with no spinner"
		// (GlobalSearch.svelte), and is never a network event. The clock still
		// runs past the debounce, so a request scheduled by mistake would be sent.
		await box.fill(first);
		await expect(spinner(dialog)).toBeHidden();
		await expect(paper).toBeVisible();
		await page.clock.runFor(PAST_THE_DEBOUNCE);

		// The cache key is the normalised query ("Normalised here so equivalent
		// queries share one Cloudflare cache key", GlobalSearch.svelte), so case and
		// spacing don't make a new search either.
		await box.fill('  Brachistochrone   CHALLENGE ');
		await expect(spinner(dialog)).toBeHidden();
		await expect(paper).toBeVisible();
		await page.clock.runFor(PAST_THE_DEBOUNCE);

		await expect(rows).toHaveCount(1);
		expect(queries).toEqual([first, longer]);
	});

	test('a 300-character paste names the limit and its length, and sends nothing', async ({
		page
	}) => {
		const queries = recordDeepSearches(page);
		await page.clock.install({ time: CLOCK_START });
		const { dialog, box } = await openFilesMode(page);
		await page.clock.pauseAt(CLOCK_PAUSE);
		const rows = resultRows(dialog);

		// A result on screen first, so the paste must also hide a list it would
		// otherwise keep.
		await box.fill(FILES_PANEL.inMarking);
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		await expect(rows).toHaveCount(1);

		// Words, as a paste would be, cut to end on a letter so the trim the
		// normalisation applies can't shorten it.
		const pasted = 'the bead slides along the cycloid '.repeat(10).slice(0, 300);
		expect(pasted).toHaveLength(300);
		await box.fill(pasted);

		// "Checked on the client too, so an over-long paste gets a clear message
		// instead of a server 400 shown as a failure whose "Try again" can never
		// succeed" (`deepTooLong`, GlobalSearch.svelte).
		await expect(dialog.getByText(TOO_LONG)).toBeVisible();
		await expect(
			dialog.getByText(`300 characters — the limit is ${MAX_LENGTH}.`, { exact: true })
		).toBeVisible();
		await expect(rows).toHaveCount(0);
		await expect(spinner(dialog)).toBeHidden();
		await expect(dialog.getByText(FAILED)).toBeHidden();

		// "Refuse, don't truncate" (the deep-search effect): nothing is ever sent.
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		await expect(spinner(dialog)).toBeHidden();
		expect(queries).toEqual([FILES_PANEL.inMarking]);
	});

	test('a pasted sentence finds its document first, and only that one', async ({ page }) => {
		const { dialog, box } = await openFilesMode(page);
		const rows = resultRows(dialog);

		// As copied: a capital and a full stop, which the tokenizer drops. Every word
		// is in the P1 solution too, so the looser rungs would also find that.
		await box.fill(FILES_PANEL.sentence);
		await expect(rows.first().getByRole('link')).toHaveAttribute('href', urls.paper);
		// "a phrase hit must not be diluted by a looser rung's near misses"
		// (`searchFiles`, src/lib/server/db/queries/files.ts).
		await expect(rows).toHaveCount(1);
	});

	test('words adjacent in one document find that one file, and backspacing keeps it', async ({
		page
	}) => {
		const queries = recordDeepSearches(page);
		await page.clock.install({ time: CLOCK_START });
		const { dialog, box } = await openFilesMode(page);
		await page.clock.pauseAt(CLOCK_PAUSE);
		const rows = resultRows(dialog);
		const solution = fileRow(dialog, 'Solution');

		// The five words are in the year paper too, but apart.
		await box.fill(FILES_PANEL.adjacentInSolution);
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		await expect(rows).toHaveCount(1);
		await expect(solution.getByRole('link')).toHaveAttribute('href', urls.solution);

		// Backspace into the last word. During the debounce the list stays.
		for (let i = 0; i < 3; i++) await box.press('Backspace');
		await expect(box).toHaveValue('bead slides between two poi');
		await expect(rows).toHaveCount(1);
		await expect(solution).toBeVisible();
		await expect(dialog.getByText(SEARCHING)).toBeHidden();

		// And after it: "Its trailing `*` keeps search-as-you-type alive"
		// (`sanitizeFtsQuery`, src/lib/server/db/queries/files.ts), so the cut word
		// still matches as a prefix.
		const searched = page.waitForResponse((response) => isDeepSearch(new URL(response.url())));
		await page.clock.runFor(PAST_THE_DEBOUNCE);
		expect((await searched).status()).toBe(200);
		await expect(spinner(dialog)).toBeHidden();
		await expect(rows).toHaveCount(1);
		await expect(solution.getByRole('link')).toHaveAttribute('href', urls.solution);
		await expect(dialog.getByText(NO_MATCHES)).toBeHidden();
		expect(queries).toEqual([FILES_PANEL.adjacentInSolution, 'bead slides between two poi']);
	});

	test('the hidden problems panel renders no rows in files mode', async ({ page }) => {
		const { dialog, box } = await openDialog(page);
		const problemsPanel = dialog.getByRole('tabpanel', { name: 'Problems', includeHidden: true });
		const filesPanel = dialog.getByRole('tabpanel', { name: 'Files', includeHidden: true });

		// Positive control: the index is loaded, and this query lists a problem.
		await box.fill('sliding bead');
		await expect(resultRows(problemsPanel).filter({ hasText: 'Sliding Bead' })).toBeVisible();

		// "Keep the `{#if}` inside each panel: bits-ui leaves the inactive panel
		// mounted, so without it the problems panel would rerun `rank()` on every
		// keystroke in files mode" (GlobalSearch.svelte).
		const filesDialog = await toFilesMode(page);
		await expect(resultRows(filesPanel)).toHaveCount(1);
		await expect(fileRow(filesPanel, 'Solution')).toBeVisible();
		await expect(problemsPanel).toBeHidden();
		await expect(resultRows(problemsPanel)).toHaveCount(0);
		// Every row in the dialog is a file row.
		await expect(resultRows(filesDialog)).toHaveCount(1);

		// Still none after more typing in files mode.
		await box.fill('sliding bead from rest');
		await expect(resultRows(filesPanel)).toHaveCount(1);
		await expect(resultRows(problemsPanel)).toHaveCount(0);
	});

	test('a term in a year paper and a problem file gives two rows; only one lists a problem', async ({
		page
	}) => {
		const { dialog, box } = await openFilesMode(page);

		await box.fill(FILES_PANEL.inPaperAndSolution);
		await expect(resultRows(dialog)).toHaveCount(2);

		// "An empty list marks a year-level file" (`resolveOwners`,
		// src/lib/server/db/queries/files.ts), so the paper's row names no problem.
		const paper = fileRow(dialog, 'Problems');
		await expect(paper.getByRole('link')).toHaveAttribute('href', urls.paper);
		await expect(paper.getByText(FILES_PANEL.olympiadName)).toBeVisible();
		await expect(paper.getByText('2015', { exact: true })).toBeVisible();
		await expect(paper.getByText(/^P\d+/)).toHaveCount(0);

		const solution = fileRow(dialog, 'Solution');
		await expect(solution.getByRole('link')).toHaveAttribute('href', urls.solution);
		await expect(solution.getByText('P1', { exact: true })).toBeVisible();
	});

	test('a file attached to two problems is one row listing both', async ({ page }) => {
		const { dialog, box } = await openFilesMode(page);

		// "the map also collapses a multi-problem file into one hit" (`resolveOwners`,
		// src/lib/server/db/queries/files.ts). Problems in id order.
		await box.fill(FILES_PANEL.inMarking);
		const rows = resultRows(dialog);
		await expect(rows).toHaveCount(1);
		await expect(rows.getByRole('link')).toHaveAttribute('href', urls.marking);
		await expect(rows.getByText('Marking scheme', { exact: true })).toHaveCount(1);
		await expect(rows.getByText('P2, P3', { exact: true })).toBeVisible();
	});

	test('switching back to problem mode keeps its topic filter', async ({ page }) => {
		const { dialog, box } = await openDialog(page);
		const topicFilter = dialog.getByRole('button', { name: 'Filter by topic' });
		const slidingBead = resultRows(dialog).filter({ hasText: 'Sliding Bead' });

		await filterByTopic(page, dialog, 'Mechanics');
		await box.fill('sliding bead');
		await expect(slidingBead).toBeVisible();
		await expect(topicFilter).toHaveAttribute('title', 'Mechanics');
		await expect(dialog.getByText(/your filters/)).toBeVisible();

		// Files mode shows only its own filters, and says the problem ones stopped
		// applying rather than dropping them.
		const filesDialog = await toFilesMode(page);
		await expect(topicFilter).toHaveCount(0);
		await expect(fileRow(filesDialog, 'Solution')).toBeVisible();
		await expect(
			filesDialog.getByText(
				"Topic and progress filters don't apply to files — one file can cover a whole year."
			)
		).toBeVisible();

		// "Hidden, not disabled … Values are kept across switches" (GlobalSearch.svelte).
		await page.getByRole('tab', { name: 'Problems' }).click();
		await expect(page.getByRole('dialog', { name: 'Search problems' })).toBeVisible();
		await expect(topicFilter).toHaveAttribute('title', 'Mechanics');
		await expect(slidingBead).toBeVisible();
		await expect(dialog.getByText(/your filters/)).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Clear filters' })).toBeVisible();
		await expect(box).toHaveValue('sliding bead');
	});

	test('a failed search says so, never "no files", and Try again recovers', async ({ page }) => {
		const queries = recordDeepSearches(page);
		// A 500 whose body parses as an empty answer: only the `res.ok` check stands
		// between it and "No files contain that phrase". "Check `res.ok` before
		// `json()`: an HTML error body would throw and leave the panel claiming
		// there are no files" (`DeepSearch.run`, deep-search.svelte.ts).
		await page.route(isDeepSearch, (route) =>
			route.fulfill({
				status: 500,
				contentType: 'application/json',
				body: JSON.stringify({ query: '', results: [], truncated: false, indexEmpty: false })
			})
		);
		const { dialog, box } = await openFilesMode(page);

		await box.fill(FILES_PANEL.inMarking);
		await expect(dialog.getByText(FAILED)).toBeVisible();
		await expect(dialog.getByText(NO_MATCHES)).toBeHidden();
		await expect(resultRows(dialog)).toHaveCount(0);
		await expect(spinner(dialog)).toBeHidden();

		// The failure was not cached: Try again sends the same query again.
		await page.unroute(isDeepSearch);
		await dialog.getByRole('button', { name: 'Try again' }).click();
		await expect(resultRows(dialog)).toHaveCount(1);
		await expect(dialog.getByText(FAILED)).toBeHidden();
		await expect(fileRow(dialog, 'Marking scheme').getByRole('link')).toHaveAttribute(
			'href',
			urls.marking
		);
		expect(queries).toEqual([FILES_PANEL.inMarking, FILES_PANEL.inMarking]);
	});
});
