import type { Locator, Page } from '@playwright/test';
import { RANKING, XSS_TITLE } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, openSearch } from '../../support/ui';

/*
 * The ⌘K dialog's problem filters, keyboard and failure states
 * (src/lib/components/search/GlobalSearch.svelte): which filters show for whom,
 * the progress filter agreeing with the olympiad page, filters applying before
 * ranking, the filtered pool's order with no query, the shortcut, the tabs and
 * the topic menu from the keyboard, and what a failed `/api/search` or
 * `/progress` shows. See docs/search.md, "Problem mode: the fuzzy index" and
 * "The client".
 *
 * Owns USERS.searcher, whose progress rows (SEARCHER_PROGRESS) are seeded and
 * never changed, and the RANKING olympiad, which it only reads. Reads frozen
 * rows (alpha, beta, delta, delta-w, e2e-assigned) and writes nothing.
 */

/** The dialog's result rows. `[data-result-index]` is the hook the shell scrolls by. */
function resultRows(dialog: Locator): Locator {
	return dialog.locator('[data-result-index]');
}

/** The query input: an unlabelled `type="search"` input. */
function searchBox(dialog: Locator): Locator {
	return dialog.getByRole('searchbox');
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A result row's text: the olympiad, `·`, the year, then the number and title.
 * With no title the row must end at the number, so "2020 2" can't match a row
 * whose number merely starts with 2.
 */
function rowText(olympiad: string, year: number, number: string, title?: string): RegExp {
	const head = `${escapeRegExp(olympiad)}\\s*·\\s*${year}\\s*${escapeRegExp(number)}`;
	return new RegExp(title === undefined ? `${head}\\s*$` : `${head}\\s*${escapeRegExp(title)}`);
}

const ALPHA = 'Alpha Physics Olympiad';

type AlphaProblem = {
	year: number;
	number: string;
	title?: string;
	/** The tracking control's name on the olympiad page when done; `null` when not. */
	done: string | null;
};

/**
 * Alpha's problems in `getSearchIndex`'s order (year descending, then id), with
 * USERS.searcher's progress on each (SEARCHER_PROGRESS). Both views are checked
 * against this one table, so they must agree with each other.
 */
const ALPHA_PROBLEMS: AlphaProblem[] = [
	{ year: 2020, number: '1', title: 'Heat Engine', done: 'Problem 1 — done, no score recorded' },
	{ year: 2020, number: '2', done: null },
	{ year: 2019, number: 'T1', title: 'Rolling Cylinder', done: 'Problem T1 — 8 out of 10' },
	{ year: 2019, number: 'T2', title: XSS_TITLE, done: null },
	{ year: 2019, number: 'T3', title: 'Fast Rocket', done: null }
];

const ALPHA_DONE = ALPHA_PROBLEMS.filter((p) => p.done !== null);
const ALPHA_TODO = ALPHA_PROBLEMS.filter((p) => p.done === null);

/** The ⌘K row of an alpha problem. */
function alphaRow(p: AlphaProblem): RegExp {
	return rowText(ALPHA, p.year, p.number, p.title);
}

/** The RANKING target's row. */
const TARGET_ROW = rowText(RANKING.name, RANKING.year, RANKING.target.number, RANKING.target.title);

/**
 * USERS.searcher's whole "Done" list with no query, in `getSearchIndex`'s order:
 * olympiad display order (alpha 10, beta 20, delta-w 31, RANKING 5700), then
 * year descending. Exact, since no other spec writes the searcher's progress.
 */
const SEARCHER_DONE = [
	rowText(ALPHA, 2020, '1', 'Heat Engine'),
	rowText(ALPHA, 2019, 'T1', 'Rolling Cylinder'),
	rowText('Beta Physics Olympiad', 2021, '1', 'Beta Spring'),
	rowText('Delta Physics Olympiad (Women)', 2020, '1', 'Delta Women Circuit'),
	TARGET_ROW
];

/**
 * The frozen problems USERS.searcher has not done, in `getSearchIndex`'s order.
 * Other specs' rows may sit between them, so only their relative order is fixed.
 */
const FROZEN_TODO = [
	rowText(ALPHA, 2020, '2'),
	rowText(ALPHA, 2019, 'T2', XSS_TITLE),
	rowText(ALPHA, 2019, 'T3', 'Fast Rocket'),
	rowText('Delta Physics Olympiad', 2020, '1', 'Delta Lens'),
	rowText('Assigned Physics Olympiad', 2018, 'P1', 'Assigned Problem')
];

/** "Showing first 50 results — …", under a list cut at MAX_RESULTS. */
const CAPPED = 'Showing first 50 results — refine your search to narrow down.';

/**
 * Fails the page's first GET of `pathname` with a 500 and lets every later one
 * through. Returns a reader for how many requests the page has sent to it.
 */
async function failFirst(page: Page, pathname: string): Promise<() => number> {
	let requests = 0;
	await page.route(
		(url) => url.pathname === pathname,
		(route) => {
			requests++;
			if (requests > 1) return route.continue();
			return route.fulfill({ status: 500, body: 'Internal Error' });
		}
	);
	return () => requests;
}

type SeenKey = { key: string; shiftKey: boolean; target: string };

/**
 * Records every keydown in `keys` (compared lowercased) as the window sees it,
 * after the event has bubbled, where the dialog's own handler listens. Returns
 * a reader for the record. The `target` is the element's tag name, plus the
 * type of an input: the dialog's query box is `INPUT[search]`.
 */
async function recordKeydowns(page: Page, keys: string[]): Promise<() => Promise<SeenKey[]>> {
	await page.evaluate((watched) => {
		const seen: SeenKey[] = [];
		(window as unknown as { seenKeys: SeenKey[] }).seenKeys = seen;
		window.addEventListener('keydown', (e) => {
			if (!watched.includes(e.key.toLowerCase())) return;
			const { target: el } = e;
			const target =
				el instanceof HTMLInputElement
					? `INPUT[${el.type}]`
					: el instanceof Element
						? el.tagName
						: String(el);
			seen.push({ key: e.key, shiftKey: e.shiftKey, target });
		});
	}, keys);
	return () => page.evaluate(() => (window as unknown as { seenKeys: SeenKey[] }).seenKeys);
}

/** Ticks `topic` in the dialog's icon-only topic filter, then closes its menu. */
async function filterByTopic(page: Page, dialog: Locator, topic: string): Promise<void> {
	await dialog.getByRole('button', { name: 'Filter by topic' }).click();
	// The menu is portalled out of the dialog, so it is found from `page`.
	await page.getByRole('checkbox', { name: topic }).check();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toBeHidden();
	await expect(dialog).toBeVisible();
}

/**
 * Picks `label` in a progress filter (the dialog's or the olympiad page's).
 * The trigger is named after the current choice; the menu is portalled.
 */
async function filterByProgress(
	page: Page,
	scope: Page | Locator,
	label: 'All problems' | 'Done' | 'To do'
): Promise<void> {
	await scope.getByRole('button', { name: /^Filter by progress: / }).click();
	await page.getByRole('menuitemradio', { name: label }).click();
	await expect(scope.getByRole('button', { name: `Filter by progress: ${label}` })).toBeVisible();
}

/**
 * Asserts the olympiad page lists exactly `expected` of alpha's problems: each
 * year card holds just their tracking controls, and a year with none is gone.
 */
async function expectOlympiadPageLists(page: Page, expected: AlphaProblem[]): Promise<void> {
	for (const year of [2020, 2019]) {
		// The card's id is the `#2019` target the dialog's rows link to.
		const card = page.locator(`[data-slot="card"][id="${year}"]`);
		const inYear = expected.filter((p) => p.year === year);
		if (inYear.length === 0) {
			await expect(card).toHaveCount(0);
			continue;
		}
		const controls = card.getByRole('button', {
			name: /^(Mark problem .+ as done|Problem .+ — .+)$/
		});
		await expect(controls).toHaveCount(inYear.length);
		for (const p of inYear) {
			const name = p.done ?? `Mark problem ${p.number} as done`;
			await expect(card.getByRole('button', { name, exact: true })).toBeVisible();
		}
	}
}

test.describe('⌘K problem filters', () => {
	test('signed out, the topic filter is shown and the progress filter is not', async ({ page }) => {
		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		await expect(dialog.getByRole('button', { name: 'Filter by topic' })).toBeVisible();
		// "Signed-in only: without a session nothing is "Done"" (GlobalSearch.svelte).
		await expect(dialog.getByRole('button', { name: /^Filter by progress/ })).toHaveCount(0);
	});

	test('a topic filter applies before ranking, so it finds a match past the top 50', async ({
		page
	}) => {
		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		const rows = resultRows(dialog);

		// 51 problems match; the target, with its inserted letter, ranks last and
		// is cut by MAX_RESULTS.
		await searchBox(dialog).fill(RANKING.query);
		await expect(rows).toHaveCount(50);
		await expect(dialog.getByText(CAPPED)).toBeVisible();
		await expect(rows.filter({ hasText: RANKING.target.title })).toHaveCount(0);

		// "Filter before ranking, never after: `rank()` caps at MAX_RESULTS, so
		// filtering its output would drop matches further down" (GlobalSearch.svelte;
		// docs/search.md, "Filter, then rank"). Filtering the top 50 would leave
		// nothing here, since the target is the only one with this topic.
		await filterByTopic(page, dialog, RANKING.target.topic);
		await expect(rows).toHaveText([TARGET_ROW]);
		await expect(dialog.getByText(CAPPED)).toBeHidden();
	});

	test.describe('signed in', () => {
		test.use({ role: 'searcher' });

		test('Done and To do list exactly what the olympiad page lists', async ({ page }) => {
			await gotoReady(page, '/');
			const dialog = await openSearch(page);
			// Both filters show with a session.
			await expect(dialog.getByRole('button', { name: 'Filter by topic' })).toBeVisible();
			const alphaRows = resultRows(dialog).filter({ hasText: ALPHA });

			// No query: the filter lists the whole filtered pool, alpha's part of it
			// in index order. A row the progress map hasn't reached yet would show
			// under To do, so Done (exact) is checked first.
			await filterByProgress(page, dialog, 'Done');
			await expect(alphaRows).toHaveText(ALPHA_DONE.map(alphaRow));
			await filterByProgress(page, dialog, 'To do');
			await expect(alphaRows).toHaveText(ALPHA_TODO.map(alphaRow));

			// The olympiad page's status filter, for the same user. `isDone` and the
			// page's own check both come down to "a key exists" (#lib/filters.ts:
			// "so they all agree on what matches and what counts as done").
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			await gotoReady(page, '/olympiads/alpha');
			// Every control reads "Mark problem … as done" until the progress fetch
			// lands; wait for the scored one before filtering.
			await expect(
				page.getByRole('button', { name: 'Problem T1 — 8 out of 10', exact: true })
			).toBeVisible();

			await filterByProgress(page, page, 'Done');
			await expectOlympiadPageLists(page, ALPHA_DONE);
			await filterByProgress(page, page, 'To do');
			await expectOlympiadPageLists(page, ALPHA_TODO);
			await filterByProgress(page, page, 'All problems');
			await expectOlympiadPageLists(page, ALPHA_PROBLEMS);
		});

		test('with no query, a filter lists the filtered pool by olympiad, then year descending', async ({
			page
		}) => {
			await gotoReady(page, '/');
			const dialog = await openSearch(page);
			const rows = resultRows(dialog);

			// "An empty query with a filter set lists the filtered pool (in
			// `getSearchIndex`'s order)" (GlobalSearch.svelte); docs/search.md: "An
			// empty query with a filter set lists the first 50 of the filtered pool,
			// unranked." The searcher's Done list is theirs alone, so it is exact:
			// alpha 2020 before alpha 2019, then beta, delta-w and RANKING.
			await filterByProgress(page, dialog, 'Done');
			await expect(rows).toHaveText(SEARCHER_DONE);
			await expect(dialog.getByText('5 problems match your filters')).toBeVisible();

			// To do holds every other problem, more than 50 of them (RANKING's alone
			// pass the cap), so the list is cut and says so. The frozen olympiads sort first, so their
			// rows are all inside the first 50, in index order.
			await filterByProgress(page, dialog, 'To do');
			await expect(rows).toHaveCount(50);
			await expect(dialog.getByText(CAPPED)).toBeVisible();
			const texts = await rows.allTextContents();
			const positions = FROZEN_TODO.map((pattern) => texts.findIndex((t) => pattern.test(t)));
			expect(positions, 'every frozen to-do problem is listed').not.toContain(-1);
			expect(positions, 'in index order').toEqual([...positions].sort((a, b) => a - b));
			// And none of the searcher's done problems.
			for (const done of SEARCHER_DONE.slice(0, 4)) {
				expect(texts.some((t) => done.test(t))).toBe(false);
			}
		});

		test('the progress filter applies before ranking too', async ({ page }) => {
			await gotoReady(page, '/');
			const dialog = await openSearch(page);
			const rows = resultRows(dialog);

			// docs/search.md, "Filter, then rank": filtering the top 50 would "show
			// two "Done" results when forty exist further down". The searcher's only
			// done RANKING problem is the one ranked past the cut.
			await searchBox(dialog).fill(RANKING.query);
			await expect(rows).toHaveCount(50);
			await filterByProgress(page, dialog, 'Done');
			await expect(rows).toHaveText([TARGET_ROW]);
		});
	});
});

test.describe('⌘K from the keyboard', () => {
	test('Ctrl+K and ⌘K toggle the dialog, with caps lock too, but not with Shift', async ({
		page
	}) => {
		await gotoReady(page, '/');
		const dialog = page.getByRole('dialog');

		// What each press really sends, so the caps-lock case is the one tested.
		const seen = await recordKeydowns(page, ['k']);
		const lastKey = async () => (await seen()).at(-1);

		// Ctrl on every platform, and ⌘ (Meta) too: the handler takes either.
		await page.keyboard.press('Control+k');
		await expect(dialog).toBeVisible();
		await expect(searchBox(dialog)).toBeFocused();
		await page.keyboard.press('Control+k');
		await expect(dialog).toBeHidden();
		await page.keyboard.press('Meta+k');
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Meta+k');
		await expect(dialog).toBeHidden();

		// Caps lock: the key arrives as "K" with no Shift. "Lowercased: with caps
		// lock on, `e.key` is `'K'`" (onWindowKeydown, GlobalSearch.svelte).
		await page.keyboard.press('Control+K');
		expect(await lastKey()).toMatchObject({ key: 'K', shiftKey: false });
		await expect(dialog).toBeVisible();
		await page.keyboard.press('Control+K');
		await expect(dialog).toBeHidden();

		// With Shift held the chord is not ⌘K, and is deliberately left alone
		// ("Not ⌘⇧K, which is Firefox's Web Console"). Each Shift press is followed
		// by a plain one: had the Shift press toggled, the pair would cancel out.
		// `data-state`, not visibility: a dialog that has just closed is still
		// visible through its exit animation.
		await page.keyboard.press('Control+Shift+K');
		expect(await lastKey()).toMatchObject({ key: 'K', shiftKey: true });
		await page.keyboard.press('Control+k');
		await expect(dialog).toHaveAttribute('data-state', 'open');
		await page.keyboard.press('Control+Shift+K');
		await page.keyboard.press('Control+k');
		await expect(dialog).toBeHidden();
	});

	test('arrowing through the topic menu does not move the result highlight', async ({ page }) => {
		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		const rows = resultRows(dialog);

		// Two rows on different pages: Enter on row 0 opens delta, on row 1 delta-w.
		await searchBox(dialog).fill('delta');
		await expect(rows.first()).toContainText('Delta Lens');
		await expect(rows.nth(1)).toContainText('Delta Women Circuit');

		const seen = await recordKeydowns(page, ['arrowdown', 'arrowup']);
		await dialog.getByRole('button', { name: 'Filter by topic' }).click();
		await expect(page.getByRole('menu')).toBeVisible();
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('ArrowUp');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Escape');
		await expect(page.getByRole('menu')).toBeHidden();
		await expect(dialog).toHaveAttribute('data-state', 'open');

		// The arrows did reach the window, where the dialog's handler listens, from
		// the menu's trigger and checkboxes: nothing upstream swallowed them. So the
		// guard below is what kept the list still.
		const arrows = await seen();
		expect(arrows).toHaveLength(4);
		expect(arrows.map((k) => k.target)).not.toContain('INPUT[search]');

		// "Only while focus is in the input, or an open filter dropdown and the list
		// would both react to the arrows" (onWindowKeydown, GlobalSearch.svelte). The
		// highlight is still on row 0, so Enter opens delta, not delta-w.
		await searchBox(dialog).focus();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL('/olympiads/delta#2020');
		await expect(dialog).toBeHidden();
	});

	test('Escape closes the topic menu first, then the dialog', async ({ page }) => {
		await gotoReady(page, '/');
		const dialog = await openSearch(page);

		await dialog.getByRole('button', { name: 'Filter by topic' }).click();
		const menu = page.getByRole('menu');
		await expect(menu).toBeVisible();

		// Still open, not just still visible: a dialog the same Escape closed would
		// still be on screen through its exit animation.
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();
		await expect(dialog).toHaveAttribute('data-state', 'open');

		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
	});

	test('arrows on the mode tabs switch mode and keep focus; Enter and Space move to the input', async ({
		page
	}) => {
		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		const problemsTab = dialog.getByRole('tab', { name: 'Problems' });
		const filesTab = dialog.getByRole('tab', { name: 'Files' });
		const box = searchBox(dialog);

		// "Wired to the triggers, not `onValueChange`: arrowing between tabs already
		// changes the mode, and refocusing then would pull focus out of the tablist"
		// (SearchModeTabs.svelte).
		await problemsTab.focus();
		await page.keyboard.press('ArrowRight');
		await expect(filesTab).toHaveAttribute('aria-selected', 'true');
		await expect(filesTab).toBeFocused();
		// The title and the placeholder follow the mode.
		await expect(page.getByRole('dialog', { name: 'Search inside files' })).toBeVisible();
		await expect(box).toHaveAttribute('placeholder', 'Search inside files…');

		await page.keyboard.press('ArrowLeft');
		await expect(problemsTab).toHaveAttribute('aria-selected', 'true');
		await expect(problemsTab).toBeFocused();
		await expect(page.getByRole('dialog', { name: 'Search problems' })).toBeVisible();

		// "Enter/Space need their own handler because bits-ui prevents the default
		// on them, so no click fires" (SearchModeTabs.svelte).
		await page.keyboard.press('Enter');
		await expect(box).toBeFocused();
		await expect(problemsTab).toHaveAttribute('aria-selected', 'true');

		await problemsTab.focus();
		await page.keyboard.press('ArrowRight');
		await expect(filesTab).toBeFocused();
		await page.keyboard.press('Space');
		await expect(box).toBeFocused();
		await expect(filesTab).toHaveAttribute('aria-selected', 'true');
		await expect(box).toHaveAttribute('placeholder', 'Search inside files…');
	});
});

test.describe('⌘K failure states', () => {
	test('a failed /api/search shows the error, not "No results", and the next open retries', async ({
		page
	}) => {
		const requests = await failFirst(page, '/api/search');

		await gotoReady(page, '/');
		let dialog = await openSearch(page);
		const failed = dialog.getByText("Couldn't load the search index");
		await expect(failed).toBeVisible();
		await expect(dialog.getByText('Close this and reopen it to try again.')).toBeVisible();

		// A query or a filter doesn't turn the failure into "No results found".
		await searchBox(dialog).fill('cylinder');
		await filterByTopic(page, dialog, 'Mechanics');
		await expect(failed).toBeVisible();
		await expect(dialog.getByText('No results found')).toBeHidden();
		await expect(resultRows(dialog)).toHaveCount(0);

		// `Resource`'s guards are plain fields, since making "them reactive would
		// make a failing fetch retry in a loop" (src/lib/resource.svelte.ts).
		// eslint-disable-next-line playwright/no-wait-for-timeout -- resource.svelte.ts: "them reactive would make a failing fetch retry in a loop"
		await page.waitForTimeout(1000);
		expect(requests(), '/api/search requests after one failure').toBe(1);

		// "`loadOnce` remembers only successes, so a failure is retried"
		// (src/lib/resource.svelte.ts): the hint's "reopen" works.
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
		dialog = await openSearch(page);
		await searchBox(dialog).fill('cylinder');
		await expect(resultRows(dialog).filter({ hasText: 'Rolling Cylinder' })).toBeVisible();
		await expect(dialog.getByText("Couldn't load the search index")).toBeHidden();
		expect(requests()).toBe(2);
	});

	test.describe('signed in', () => {
		test.use({ role: 'searcher' });

		test('a failed /progress counts nothing as done, says nothing, and the next open retries', async ({
			page
		}) => {
			const requests = await failFirst(page, '/progress');

			await gotoReady(page, '/');
			let dialog = await openSearch(page);
			const rows = resultRows(dialog);
			await expect.poll(requests).toBe(1);

			// "No toast: tracking is an enhancement" (fetchProgress, GlobalSearch.svelte).
			// The progress map stays empty, so every problem reads as to do: Done
			// lists nothing, and To do lists a problem the searcher has done.
			await filterByProgress(page, dialog, 'Done');
			await expect(dialog.getByText('No results found')).toBeVisible();
			await expect(dialog.getByRole('button', { name: 'Clear filters' })).toBeVisible();
			await filterByProgress(page, dialog, 'To do');
			await searchBox(dialog).fill('cylinder');
			await expect(rows.filter({ hasText: 'Rolling Cylinder' })).toBeVisible();
			// No error state either: the index loaded, only the progress didn't.
			await expect(dialog.getByText("Couldn't load the search index")).toBeHidden();
			await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);

			// "don't guard on `progressLoading` instead: it is `$state` written by
			// `fetchProgress`, so after a failure the effect would refetch in a loop"
			// (`progressInFlightFor`, GlobalSearch.svelte).
			// eslint-disable-next-line playwright/no-wait-for-timeout -- GlobalSearch.svelte, progressInFlightFor: "after a failure the effect would refetch in a loop"
			await page.waitForTimeout(1000);
			expect(requests(), '/progress requests after one failure').toBe(1);

			// "`progressFetchedFor` stays unset, so the next open retries."
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			dialog = await openSearch(page);
			await filterByProgress(page, dialog, 'Done');
			await expect(resultRows(dialog)).toHaveText(SEARCHER_DONE);
			expect(requests()).toBe(2);
		});
	});
});
