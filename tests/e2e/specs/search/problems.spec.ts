import type { Locator, Page } from '@playwright/test';
import { PROBLEM_TOPICS } from '../../../../src/lib/types';
import { XSS_TITLE } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, openSearch } from '../../support/ui';

/*
 * The ⌘K dialog in problem mode (src/lib/components/search/GlobalSearch.svelte),
 * driven through the UI: the reset on open, the highlight, Enter on the hovered
 * row, escaping, the session caches, and topics never shown. See docs/search.md,
 * "The client".
 *
 * Reads frozen seed rows only (alpha, delta, delta-w), never owned ones: another
 * spec may rename those, and `/api/search` is shared-cached from whenever the
 * run first fetched it. Writes nothing.
 */

/** The dialog's result rows. `[data-result-index]` is the hook the shell scrolls by. */
function resultRows(dialog: Locator): Locator {
	return dialog.locator('[data-result-index]');
}

/** The query input: an unlabelled `type="search"` input. */
function searchBox(dialog: Locator): Locator {
	return dialog.getByRole('searchbox');
}

/** Every topic name, so a row can be checked for any of them, in any case. */
const ANY_TOPIC = new RegExp(PROBLEM_TOPICS.join('|'), 'i');

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

test.describe('⌘K problem search', () => {
	test('<mark> highlights the match, and Enter opens the hovered row', async ({ page }) => {
		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		await searchBox(dialog).fill('delta');

		// Two 2020 problems that differ only in olympiad, so opening the wrong row
		// lands on a different page. Enter with nothing hovered opens row 0 (delta's
		// Delta Lens, the shorter haystack), so the row hovered must be another.
		const hovered = resultRows(dialog).filter({ hasText: 'Delta Women Circuit' });
		await expect(hovered).toHaveCount(1);
		await expect(hovered).not.toHaveAttribute('data-result-index', '0');

		// `highlight()` marks the matched characters in the olympiad name and the
		// title, and nothing else in the row (not the year, not the number).
		await expect(hovered.locator('mark')).toHaveText(['Delta', 'Delta']);

		// "The shell owns focus; this only reports hover via `onhover`"
		// (SearchResultItem.svelte): hovering moves the keyboard row, and focus stays
		// in the input, where the window handler takes Enter.
		await hovered.hover();
		await expect(searchBox(dialog)).toBeFocused();
		await page.keyboard.press('Enter');

		await expect(page).toHaveURL('/olympiads/delta-w#2020');
		await expect(dialog).toBeHidden();
	});

	test('Enter after hovering far down, then narrowing, opens a visible row', async ({ page }) => {
		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		const rows = resultRows(dialog);

		// Every seeded olympiad with problems is a "Physics Olympiad", so this lists
		// every problem: at least the nine frozen ones.
		await searchBox(dialog).fill('physics');
		await expect(rows.nth(8)).toBeVisible();
		await rows.last().hover();

		// The keyboard row is now past the end of the narrowed list. "Reset the
		// keyboard highlight to the top whenever what is listed changes", and
		// `focused` is "`focusedIndex` clamped on read" (GlobalSearch.svelte), so
		// Enter opens the row on screen rather than nothing.
		await searchBox(dialog).fill('delta lens');
		await expect(rows.first()).toContainText('Delta Lens');
		await expect(searchBox(dialog)).toBeFocused();
		await page.keyboard.press('Enter');

		await expect(page).toHaveURL('/olympiads/delta#2020');
		await expect(dialog).toBeHidden();
	});

	test('an XSS title renders as literal text, with the match still marked', async ({ page }) => {
		// An alert would mean the payload ran (its `src=x` 404s, firing `onerror`).
		// Recorded rather than left to Playwright's silent auto-dismiss.
		const alerts: string[] = [];
		page.on('dialog', (alert) => {
			alerts.push(alert.message());
			void alert.dismiss();
		});

		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		await searchBox(dialog).fill('onerror');

		// "This function is the only thing between a contributor-typed title and the
		// DOM" (`highlight` in src/lib/utils/fuzzy.ts): it must escape every slice,
		// including the ones it wraps in <mark>.
		const row = resultRows(dialog).filter({ hasText: XSS_TITLE });
		await expect(row).toHaveCount(1);
		await expect(row).toContainText('T2');
		await expect(row.getByText(XSS_TITLE, { exact: true })).toBeVisible();
		await expect(row.locator('mark')).toHaveText(['onerror']);
		await expect(page.locator('img[src="x"]')).toHaveCount(0);
		expect(alerts).toEqual([]);
	});

	test('no topic label is ever rendered in a result row', async ({ page }) => {
		// Topics "are sent in the public payloads for client-side filtering, but
		// never render them next to a problem (spoilers)" (`ProblemEntry.topics` in
		// src/lib/types.ts). Every alpha problem but one has a topic, and no seeded
		// title contains a topic name.
		await gotoReady(page, '/');
		const dialog = await openSearch(page);
		const alphaRows = resultRows(dialog).filter({ hasText: 'Alpha Physics Olympiad' });

		await searchBox(dialog).fill('alpha');
		await expect(alphaRows.filter({ hasText: 'Rolling Cylinder' })).toBeVisible();
		await expect(alphaRows.filter({ hasText: 'Fast Rocket' })).toBeVisible();
		await expect(alphaRows.filter({ hasText: 'Heat Engine' })).toBeVisible();
		await expect(alphaRows.filter({ hasText: ANY_TOPIC })).toHaveCount(0);

		// Rows chosen by a topic filter, with no query, are still unlabelled. Fast
		// Rocket is tagged Relativity and Modern.
		await searchBox(dialog).fill('');
		await filterByTopic(page, dialog, 'Relativity');
		await expect(alphaRows.filter({ hasText: 'Fast Rocket' })).toBeVisible();
		await expect(alphaRows.filter({ hasText: 'Rolling Cylinder' })).toHaveCount(0);
		await expect(alphaRows.filter({ hasText: ANY_TOPIC })).toHaveCount(0);
	});

	test.describe('signed in', () => {
		// The progress filter and `/progress` exist only with a session.
		test.use({ role: 'user' });

		test('reopening resets the query and the filters', async ({ page }) => {
			await gotoReady(page, '/');
			let dialog = await openSearch(page);
			await searchBox(dialog).fill('cylinder');
			await expect(resultRows(dialog).filter({ hasText: 'Rolling Cylinder' })).toBeVisible();

			// Set both problem filters. Rolling Cylinder is Mechanics, and Uma has no
			// progress, so it stays listed.
			await filterByTopic(page, dialog, 'Mechanics');
			await dialog.getByRole('button', { name: 'Filter by progress: All problems' }).click();
			await page.getByRole('menuitemradio', { name: 'To do' }).click();
			await expect(dialog.getByRole('button', { name: 'Filter by progress: To do' })).toBeVisible();
			await expect(dialog.getByRole('button', { name: 'Clear filters' })).toBeVisible();
			await expect(resultRows(dialog).filter({ hasText: 'Rolling Cylinder' })).toBeVisible();

			// bits-ui's escape layer prevents the default, so Chromium's own "Escape
			// clears a search input" can't do the reset's job for it.
			await searchBox(dialog).press('Escape');
			await expect(dialog).toBeHidden();

			// "A filter left over from last time would be invisible" (the reset effect
			// in GlobalSearch.svelte).
			dialog = await openSearch(page);
			await expect(searchBox(dialog)).toHaveValue('');
			await expect(dialog.getByRole('button', { name: 'Filter by topic' })).toHaveAttribute(
				'title',
				'All topics'
			);
			await expect(
				dialog.getByRole('button', { name: 'Filter by progress: All problems' })
			).toBeVisible();
			// Shown only with an empty query and no filter set.
			await expect(
				dialog.getByText('Type to search for problems across all olympiads…')
			).toBeVisible();
			await expect(dialog.getByRole('button', { name: 'Clear filters' })).toHaveCount(0);
			await expect(resultRows(dialog)).toHaveCount(0);
		});

		test('three fast opens send one /api/search and one /progress', async ({ page }) => {
			// Every request the page sends to either endpoint, counted as it leaves.
			const sent = { search: 0, progress: 0 };
			page.on('request', (request) => {
				const { pathname } = new URL(request.url());
				if (pathname === '/api/search') sent.search++;
				if (pathname === '/progress') sent.progress++;
			});

			// Hold both responses until all three opens are done, so each reopen
			// happens while the first request is still in flight. That is the case
			// the in-flight guards exist for: `Resource.loadOnce` "joins a
			// `loadOnce` already in flight rather than sending a second request"
			// (src/lib/resource.svelte.ts), and `progressInFlightFor` "Stops
			// duplicate `/progress` requests (uncached, so each is a real D1 read)"
			// (GlobalSearch.svelte).
			let release!: () => void;
			const released = new Promise<void>((resolve) => (release = resolve));
			await page.route(
				(url) => url.pathname === '/api/search' || url.pathname === '/progress',
				async (route) => {
					await released;
					await route.continue();
				}
			);

			await gotoReady(page, '/');
			let dialog = await openSearch(page);
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			dialog = await openSearch(page);
			await dialog.getByRole('button', { name: 'Close search' }).click();
			await expect(dialog).toBeHidden();
			dialog = await openSearch(page);

			// Still waiting on the first response.
			await expect(dialog.getByText('Loading search index…')).toBeVisible();
			await expect.poll(() => sent).toEqual({ search: 1, progress: 1 });

			release();
			await expect(
				dialog.getByText('Type to search for problems across all olympiads…')
			).toBeVisible();
			await expect(dialog.getByText('Loading your progress…')).toBeHidden();

			// A reopen after both have landed is served from the session cache.
			await page.keyboard.press('Escape');
			await expect(dialog).toBeHidden();
			dialog = await openSearch(page);
			await searchBox(dialog).fill('cylinder');
			await expect(resultRows(dialog).filter({ hasText: 'Rolling Cylinder' })).toBeVisible();

			expect(sent).toEqual({ search: 1, progress: 1 });
		});
	});
});
