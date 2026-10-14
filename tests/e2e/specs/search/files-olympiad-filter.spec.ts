import type { Locator, Page } from '@playwright/test';
import { BETA_BOOKLET, DELTA_W_BULK, FILE_URLS, PHRASES } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, openSearch, pickOlympiad } from '../../support/ui';

/*
 * The ⌘K dialog's olympiad filter, which scopes files mode (deep search): what
 * a scope returns, the session cache across scopes, the picker panel's search
 * and keyboard, "On this page", and how problem mode shows a filter it ignores.
 * docs/search.md, "The olympiad filter" and "The olympiad filter: a url range,
 * not a join".
 *
 * Reads frozen olympiads and documents, and BETA_BOOKLET, a beta file this spec
 * owns (seed-data.ts). Writes nothing.
 */

/** Any page off an olympiad route: the dialog is mounted by the root layout. */
const START = '/privacy';

const BETA = 'Beta Physics Olympiad';
const DELTA = 'Delta Physics Olympiad';
const DELTA_W = 'Delta Physics Olympiad (Women)';

/** The footer files mode shows when more files matched than came back. */
const TRUNCATED = /^Showing the \d+ best-matching files/;

/** Opens the dialog on `path` and switches it to the Files tab. */
async function openFilesMode(page: Page, path = START): Promise<Locator> {
	await gotoReady(page, path);
	await openSearch(page);
	await page.getByRole('tab', { name: 'Files' }).click();
	const dialog = page.getByRole('dialog', { name: 'Search inside files' });
	await expect(dialog).toBeVisible();
	return dialog;
}

/**
 * The icon-only filter trigger. Its accessible name is "Filter by olympiad:
 * <label>" (OlympiadPicker.svelte's sr-only span), so the name says what is set.
 */
function filterTrigger(dialog: Locator): Locator {
	return dialog.getByRole('button', { name: /^Filter by olympiad: / });
}

/** The picker panel's own search box. The panel is portalled, so it is found from `page`. */
function panelSearch(page: Page): Locator {
	return page.getByPlaceholder('Search olympiads…');
}

/** One of the panel's rows, by its exact name ("Delta …" is a prefix of "Delta … (Women)"). */
function option(page: Page, name: string): Locator {
	return page.getByRole('option', { name, exact: true });
}

/**
 * Picks `name` in the dialog's single-mode picker, which closes itself on a pick.
 */
async function pick(page: Page, dialog: Locator, name: string): Promise<void> {
	await pickOlympiad(page, filterTrigger(dialog), name);
	await expect(filterTrigger(dialog)).toHaveAccessibleName(`Filter by olympiad: ${name}`);
}

/** `q` and `olympiad` of every `/api/search/files` request the page sends, in order. */
function recordDeepSearches(page: Page): string[] {
	const sent: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.pathname !== '/api/search/files') return;
		sent.push(`${url.searchParams.get('q')} @ ${url.searchParams.get('olympiad') ?? 'all'}`);
	});
	return sent;
}

test.describe('⌘K files mode: the olympiad filter', () => {
	test('scoping to beta returns a file the unfiltered top 20 leaves out', async ({ page }) => {
		const dialog = await openFilesMode(page);
		const rows = dialog.locator('[data-result-index]');

		// Unfiltered: delta-w's DELTA_W_BULK short files outrank the long beta
		// booklet, so the 20 shown are all delta-w's and the footer says more matched.
		await dialog.getByRole('searchbox').fill(PHRASES.deltaWBulk);
		await expect(rows).toHaveCount(DELTA_W_BULK - 1);
		await expect(rows.filter({ hasText: DELTA_W })).toHaveCount(DELTA_W_BULK - 1);
		await expect(dialog.getByText(TRUNCATED)).toBeVisible();
		await expect(dialog.locator(`a[href="${BETA_BOOKLET.url}"]`)).toHaveCount(0);

		// "filtering the global top 20 afterwards would usually leave 0–3 rows, and
		// none if the olympiad has nothing in the global top 20" (docs/search.md, "The
		// olympiad filter: a url range, not a join"). The scope runs before the LIMIT
		// ("Every eligibility filter … runs in pass 1, before the `LIMIT`",
		// selectFtsHits in src/lib/server/db/queries/files.ts).
		await pick(page, dialog, BETA);
		await expect(filterTrigger(dialog)).toHaveAccessibleName(`Filter by olympiad: ${BETA}`);
		await expect(rows).toHaveCount(1);
		const row = rows.first();
		await expect(row.getByRole('link')).toHaveAttribute('href', BETA_BOOKLET.url);
		await expect(row.getByText(BETA_BOOKLET.label, { exact: true })).toBeVisible();
		await expect(row.getByText(BETA)).toBeVisible();
		await expect(row.getByText('2021', { exact: true })).toBeVisible();
		await expect(dialog.getByText(TRUNCATED)).toBeHidden();
	});

	test('a phrase matched only outside the scope still finds in-scope files by its words', async ({
		page
	}) => {
		const dialog = await openFilesMode(page);
		const rows = dialog.locator('[data-result-index]');

		// Unfiltered, the phrase rung matches delta-w's paper, so the ladder stops
		// there and the booklet (both words, apart) is never reached.
		await dialog.getByRole('searchbox').fill(PHRASES.deltaW);
		await expect(rows).toHaveCount(1);
		await expect(rows.getByRole('link')).toHaveAttribute('href', FILE_URLS.deltaWPaper);

		// "The ladder runs within the scope, so if rung 1 matches only out-of-scope
		// files, a scoped search falls to rung 2 and shows hits the unfiltered search
		// never did. Don't pin a scoped search to the unfiltered rung" (docs/search.md;
		// also searchFiles in src/lib/server/db/queries/files.ts, "don't pin it to the
		// unfiltered search's rung").
		await pick(page, dialog, BETA);
		await expect(rows).toHaveCount(1);
		await expect(rows.getByRole('link')).toHaveAttribute('href', BETA_BOOKLET.url);
		// Two marks, one per word: the AND rung's match, not the phrase.
		await expect(rows.locator('mark')).toHaveText(['quasistatic', 'wobble']);
	});

	test('switching olympiad and back shows each scope’s results, the second visit from the cache', async ({
		page
	}) => {
		const sent = recordDeepSearches(page);
		const dialog = await openFilesMode(page);
		const rows = dialog.locator('[data-result-index]');
		const booklet = dialog.locator(`a[href="${BETA_BOOKLET.url}"]`);
		const trigger = filterTrigger(dialog);

		await dialog.getByRole('searchbox').fill(PHRASES.deltaWBulk);
		await expect(rows).toHaveCount(DELTA_W_BULK - 1);
		await expect(booklet).toHaveCount(0);

		await pick(page, dialog, BETA);
		await expect(rows).toHaveCount(1);
		await expect(booklet).toHaveCount(1);
		expect(sent).toEqual([`${PHRASES.deltaWBulk} @ all`, `${PHRASES.deltaWBulk} @ beta`]);

		// Back to all, then to beta again. "Both are needed, or switching olympiad
		// would serve the previous olympiad's results" (deepCacheKey in
		// deep-search.svelte.ts), and "A cache hit is shown synchronously, with no
		// spinner" (GlobalSearch.svelte). An uncached key would keep the last list on
		// screen until its response landed, so once each list shows, any request for
		// it has already been sent and recorded.
		await pick(page, dialog, 'All olympiads');
		await expect(trigger).toHaveAccessibleName('Filter by olympiad: All olympiads');
		await expect(rows).toHaveCount(DELTA_W_BULK - 1);
		await expect(booklet).toHaveCount(0);
		await expect(dialog.getByText(TRUNCATED)).toBeVisible();

		await pick(page, dialog, BETA);
		await expect(rows).toHaveCount(1);
		await expect(booklet).toHaveCount(1);
		await expect(dialog.getByText(TRUNCATED)).toBeHidden();
		await expect(dialog.getByRole('status', { name: 'Loading' })).toBeHidden();

		expect(sent).toEqual([`${PHRASES.deltaWBulk} @ all`, `${PHRASES.deltaWBulk} @ beta`]);
	});

	test('the panel: its search matches name and id, its keys stay inside it', async ({ page }) => {
		const dialog = await openFilesMode(page);
		const trigger = filterTrigger(dialog);
		const search = panelSearch(page);

		await trigger.click();
		// `Popover.Content` focuses the panel's input on open.
		await expect(search).toBeFocused();
		await expect(option(page, 'All olympiads')).toBeVisible();

		// By name: "Women" is only in delta-w's name.
		await search.fill('Women');
		await expect(option(page, DELTA_W)).toBeVisible();
		await expect(option(page, DELTA)).toHaveCount(0);
		// "The standing rows are searchable too, so a query hides them" (OlympiadPicker.svelte).
		await expect(option(page, 'All olympiads')).toHaveCount(0);

		// By id: "e2e-assigned" is the id, not the name, of the Assigned olympiad.
		await search.fill('e2e-assigned');
		await expect(option(page, 'Assigned Physics Olympiad')).toBeVisible();
		await expect(option(page, DELTA_W)).toHaveCount(0);

		await search.fill('zzzzzz');
		await expect(page.getByText('No olympiad matches that.')).toBeVisible();
		await expect(page.getByRole('option')).toHaveCount(0);

		// Escape closes the innermost layer only: the panel, not the dialog.
		await page.keyboard.press('Escape');
		await expect(search).toBeHidden();
		await expect(dialog).toBeVisible();
		await expect(trigger).toHaveAccessibleName('Filter by olympiad: All olympiads');

		// "The panel's own query, cleared on close" (OlympiadPicker.svelte).
		await trigger.click();
		await expect(search).toHaveValue('');
		await expect(option(page, 'All olympiads')).toBeVisible();
		await expect(option(page, BETA)).toBeVisible();

		// The arrows move the panel's highlight, which `Command` marks with
		// `aria-selected` while focus stays in its input. delta (30) lists before
		// delta-w (31) by display order.
		await search.fill('delta');
		await expect(option(page, DELTA)).toHaveAttribute('aria-selected', 'true');
		await expect(option(page, DELTA_W)).toHaveAttribute('aria-selected', 'false');
		await search.press('ArrowDown');
		await expect(option(page, DELTA_W)).toHaveAttribute('aria-selected', 'true');
		await expect(option(page, DELTA)).toHaveAttribute('aria-selected', 'false');
		await search.press('ArrowUp');
		await expect(option(page, DELTA)).toHaveAttribute('aria-selected', 'true');
		await search.press('ArrowDown');
		await expect(search).toBeFocused();

		// Enter picks the highlighted row and closes the panel; the dialog stays.
		await search.press('Enter');
		await expect(search).toBeHidden();
		await expect(dialog).toBeVisible();
		await expect(trigger).toHaveAccessibleName(`Filter by olympiad: ${DELTA_W}`);
	});

	test('on an olympiad page, that olympiad is pinned first under "On this page", unselected', async ({
		page
	}) => {
		const dialog = await openFilesMode(page, '/olympiads/alpha');
		const trigger = filterTrigger(dialog);

		// "Pinned, not preselected: a filter that set itself from the URL would
		// silently change search results" (OlympiadPicker.svelte).
		await expect(trigger).toHaveAccessibleName('Filter by olympiad: All olympiads');

		await trigger.click();
		const pinned = page.getByRole('group', { name: 'On this page' });
		await expect(pinned).toBeVisible();
		await expect(pinned.getByRole('option')).toHaveCount(1);
		await expect(pinned.getByRole('option')).toHaveAccessibleName('Alpha Physics Olympiad');
		await expect(page.getByRole('option').first()).toHaveAccessibleName('Alpha Physics Olympiad');
		// Hoisted, not repeated in the list below.
		await expect(option(page, 'Alpha Physics Olympiad')).toHaveCount(1);
		// Then the reset row, then the rest of the list.
		await expect(page.getByRole('option').nth(1)).toHaveAccessibleName('All olympiads');
		await expect(option(page, BETA)).toBeVisible();

		// The pinned row is an ordinary choice: picking it sets the filter.
		await option(page, 'Alpha Physics Olympiad').click();
		await expect(panelSearch(page)).toBeHidden();
		await expect(dialog).toBeVisible();
		await expect(trigger).toHaveAccessibleName('Filter by olympiad: Alpha Physics Olympiad');
	});

	test('off an olympiad page there is no pinned row', async ({ page }) => {
		const dialog = await openFilesMode(page);
		await filterTrigger(dialog).click();
		await expect(panelSearch(page)).toBeFocused();
		// The panel has rendered its rows, so an absent group is really absent.
		await expect(option(page, 'Alpha Physics Olympiad')).toBeVisible();
		await expect(page.getByRole('group', { name: 'On this page' })).toHaveCount(0);
		await expect(page.getByText('On this page')).toHaveCount(0);
		await expect(page.getByRole('option').first()).toHaveAccessibleName('All olympiads');
	});

	test('in problem mode the filter is named as file-only, and it is still set back in files mode', async ({
		page
	}) => {
		const dialog = await openFilesMode(page);
		const box = dialog.getByRole('searchbox');

		await pick(page, dialog, BETA);
		// No beta file says "delta", so the scoped empty state names the olympiad:
		// "`indexEmpty` is global even under a filter, so the client names the
		// filtered olympiad itself" (GlobalSearch.svelte).
		await box.fill('delta');
		const scopedEmpty = dialog.getByText(`No ${BETA} files contain that phrase`);
		await expect(scopedEmpty).toBeVisible();

		// The query carries over; problem mode ignores the olympiad filter, and says
		// so: "Also shown for an olympiad filter set in files mode, which is
		// otherwise invisible here" (GlobalSearch.svelte).
		await page.getByRole('tab', { name: 'Problems' }).click();
		const problems = page.getByRole('dialog', { name: 'Search problems' });
		await expect(problems).toBeVisible();
		await expect(
			problems.getByText(`The ${BETA} filter applies to file search only.`)
		).toBeVisible();
		await expect(problems.getByRole('button', { name: 'Clear filters' })).toBeVisible();
		// Problems from other olympiads are still listed: the filter isn't applied here.
		await expect(
			problems.locator('[data-result-index]').filter({ hasText: 'Delta Lens' })
		).toBeVisible();
		// Problem mode's own filters replace the olympiad one in the input row.
		await expect(filterTrigger(problems)).toHaveCount(0);

		// "Switching modes discards nothing" (docs/search.md).
		await page.getByRole('tab', { name: 'Files' }).click();
		await expect(filterTrigger(dialog)).toHaveAccessibleName(`Filter by olympiad: ${BETA}`);
		await expect(box).toHaveValue('delta');
		await expect(scopedEmpty).toBeVisible();
	});
});
