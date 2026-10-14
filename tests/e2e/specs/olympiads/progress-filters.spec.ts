import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';
import { gotoReady, openSearch } from '../../support/ui';

/*
 * The olympiad page's filters over the user's progress, and the two guards in
 * src/routes/(reg)/olympiads/[olympiad]/+page.svelte that keep a late response
 * from overwriting newer state: the progress race guard and the stale-olympiad
 * guard. The status filter is StatusFilter.svelte (All problems / Done / To do,
 * an icon-only trigger); the predicates are in filter.ts and $lib/filters.ts.
 *
 * Owns USERS.progressReader, whose seeded progress on the frozen alpha is only
 * ever read, so every list below is known in advance:
 *   2019  T1 Rolling Cylinder (Mechanics, max 10)      done, 8.5
 *         T2 <XSS title>      (Electromagnetism, 10)   untracked
 *         T3 Fast Rocket      (Relativity, Modern, 7.5) done, no score
 *   2020  1  Heat Engine      (Thermodynamics, no max) done, 3
 *         2  (no title, no topics, no max)             untracked
 *
 * Owns USERS.progressRacer, whose progress the race tests arrange through the
 * action before each test. Reads the frozen alpha and beta, writes neither.
 */

const PAGE = '/olympiads/alpha';
const ACTION = `${PAGE}?/trackProblem`;
/** The signed-in user's progress in alpha. `private, no-store`, so it always reads D1. */
const PROGRESS = `${PAGE}/progress`;

/** A year's panel, by the `id` YearPanel.svelte gives it for `#2019` links. */
function yearPanel(page: Page, year: number): Locator {
	return page.locator(`[id="${year}"]`);
}

/**
 * A problem's tracking control, by the name ProgressControl.svelte gives it:
 * "Mark problem T2 as done", "Problem T3 — done, no score recorded",
 * "Problem T1 — 8.5 out of 10", or "Problem 1 — 3" with no maximum.
 */
function control(page: Page, name: string): Locator {
	return page.getByRole('button', { name, exact: true });
}

/** Any tracking control's name. Each problem card has exactly one. */
const CONTROL = /^(Mark problem \S+ as done|Problem \S+ — .+)$/;

/**
 * Asserts that a year's panel lists exactly these problems, in order, each
 * named by its tracking control, which also states its progress. One retrying
 * read of every name, so a list mid-change can't pass half a check.
 */
async function expectListed(page: Page, year: number, controls: string[]): Promise<void> {
	const listed = yearPanel(page, year).getByRole('button', { name: CONTROL });
	await expect
		.poll(() => listed.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), {
			message: `the problems listed in ${year}`
		})
		.toEqual(controls);
}

/** The status filter's trigger, named by the choice it shows. */
function statusTrigger(page: Page, choice: Status): Locator {
	return page.getByRole('button', { name: `Filter by progress: ${choice}`, exact: true });
}

type Status = 'All problems' | 'Done' | 'To do';

/** Picks `to` in the status filter. Its menu is portalled, so found from `page`. */
async function filterByStatus(page: Page, from: Status, to: Status): Promise<void> {
	await statusTrigger(page, from).click();
	await page.getByRole('menuitemradio', { name: to, exact: true }).click();
	await expect(page.getByRole('menu')).toBeHidden();
	await expect(statusTrigger(page, to)).toBeVisible();
}

/** Ticks `topic` in the page's icon-only topic filter, then closes its menu. */
async function filterByTopic(page: Page, topic: string): Promise<void> {
	await page.getByRole('button', { name: 'Filter by topic', exact: true }).click();
	await page.getByRole('checkbox', { name: topic, exact: true }).check();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('menu')).toBeHidden();
}

/** The page's text query box. */
function queryBox(page: Page): Locator {
	return page.getByPlaceholder('Search by year or problem…');
}

/** USERS.progressReader's seeded state, as each control names it. */
const READER = {
	t1: 'Problem T1 — 8.5 out of 10',
	t2: 'Mark problem T2 as done',
	t3: 'Problem T3 — done, no score recorded',
	p1: 'Problem 1 — 3',
	p2: 'Mark problem 2 as done'
};

/** Opens alpha and waits until the reader's progress has landed. */
async function openAsReader(page: Page): Promise<void> {
	await gotoReady(page, PAGE);
	// Every control reads "Mark problem … as done" until the progress fetch
	// lands, and a filter picked before then would filter an empty map.
	await expectListed(page, 2019, [READER.t1, READER.t2, READER.t3]);
	await expectListed(page, 2020, [READER.p1, READER.p2]);
}

test.describe('the status filter', () => {
	test.use({ role: 'progressReader' });

	test('All problems, Done and To do each list exactly the right problems', async ({ page }) => {
		await openAsReader(page);
		await expect(statusTrigger(page, 'All problems')).toBeVisible();

		await filterByStatus(page, 'All problems', 'Done');
		await expectListed(page, 2019, [READER.t1, READER.t3]);
		await expectListed(page, 2020, [READER.p1]);

		await filterByStatus(page, 'Done', 'To do');
		await expectListed(page, 2019, [READER.t2]);
		await expectListed(page, 2020, [READER.p2]);

		await filterByStatus(page, 'To do', 'All problems');
		await expectListed(page, 2019, [READER.t1, READER.t2, READER.t3]);
		await expectListed(page, 2020, [READER.p1, READER.p2]);
	});

	test('combines with the topic filter, and Clear filters resets both', async ({ page }) => {
		await openAsReader(page);

		// Done and Mechanics: only T1. 2020 has no match, so its panel goes
		// altogether rather than showing empty.
		await filterByStatus(page, 'All problems', 'Done');
		await filterByTopic(page, 'Mechanics');
		await expectListed(page, 2019, [READER.t1]);
		await expect(yearPanel(page, 2020)).toHaveCount(0);

		// A second topic is OR: Thermodynamics brings back 2020's done problem 1.
		await filterByTopic(page, 'Thermodynamics');
		await expectListed(page, 2019, [READER.t1]);
		await expectListed(page, 2020, [READER.p1]);

		// To do with the same topics: T1 and 1 are both done, so nothing is left.
		await filterByStatus(page, 'Done', 'To do');
		await expect(page.getByText('No results found', { exact: true })).toBeVisible();
		await expect(yearPanel(page, 2019)).toHaveCount(0);
		await expect(yearPanel(page, 2020)).toHaveCount(0);

		await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
		await expect(statusTrigger(page, 'All problems')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Filter by topic' })).toHaveAttribute(
			'title',
			'All topics'
		);
		await expectListed(page, 2019, [READER.t1, READER.t2, READER.t3]);
		await expectListed(page, 2020, [READER.p1, READER.p2]);
	});

	test('combines with the text query, and Show full year shows only what the status allows', async ({
		page
	}) => {
		await openAsReader(page);
		await filterByStatus(page, 'All problems', 'Done');

		// A problem match: only the done problem whose title matches.
		await queryBox(page).fill('rocket');
		await expectListed(page, 2019, [READER.t3]);
		await expect(yearPanel(page, 2020)).toHaveCount(0);

		// "Show full year" widens to the year's problems that pass the filters, not
		// the whole year: the untracked T2 stays out under Done.
		const fullYear = page.getByRole('switch', { name: 'Show full year' });
		await fullYear.click();
		await expect(fullYear).toBeChecked();
		await expectListed(page, 2019, [READER.t1, READER.t3]);

		// The same query under To do: the only problem it matches is done.
		await filterByStatus(page, 'Done', 'To do');
		await expect(page.getByText('No results found', { exact: true })).toBeVisible();

		// A year match keeps that year's problems that pass the status filter.
		await queryBox(page).fill('2020');
		await expectListed(page, 2020, [READER.p2]);
		await expect(yearPanel(page, 2019)).toHaveCount(0);
		await filterByStatus(page, 'To do', 'Done');
		await expectListed(page, 2020, [READER.p1]);
		await expect(yearPanel(page, 2019)).toHaveCount(0);
	});

	test('the year totals count the whole year, whatever the filters show', async ({ page }) => {
		await openAsReader(page);

		/** Each year's totals, as YearPanel.svelte's header shows them for the reader. */
		async function expectTotals(): Promise<void> {
			const y2019 = yearPanel(page, 2019);
			await expect(y2019.getByText('2/3 done', { exact: true })).toBeVisible();
			// Only T1 counts toward the ratio: T3 is done with no score, and untracked
			// T2 is left out rather than counted as 0 (`yearTotals` in $lib/progress.ts).
			await expect(y2019.getByText('8.5 / 10', { exact: true })).toBeVisible();

			const y2020 = yearPanel(page, 2020);
			await expect(y2020.getByText('1/2 done', { exact: true })).toBeVisible();
			// Problem 1 is scored but has no maximum, so it can't be in a ratio.
			await expect(y2020.getByText('+1 unscaled', { exact: true })).toBeVisible();
			await expect(y2020.getByText(/^\S+ \/ \S+$/)).toHaveCount(0);
		}

		await expectTotals();

		// "From `year.problems`, not `matchedProblems`, so filtering doesn't change
		// the totals" (YearPanel.svelte). Under To do each panel lists only its
		// untracked problem, and still counts the done ones it hides.
		await filterByStatus(page, 'All problems', 'To do');
		await expectListed(page, 2019, [READER.t2]);
		await expectListed(page, 2020, [READER.p2]);
		await expectTotals();

		await queryBox(page).fill('cylinder');
		await filterByStatus(page, 'To do', 'Done');
		await expectListed(page, 2019, [READER.t1]);
		await expect(yearPanel(page, 2020)).toHaveCount(0);
		await expect(yearPanel(page, 2019).getByText('2/3 done', { exact: true })).toBeVisible();
		await expect(yearPanel(page, 2019).getByText('8.5 / 10', { exact: true })).toBeVisible();
	});
});

test.describe('signed out', () => {
	test('there is no status filter, only the topic filter', async ({ page }) => {
		await gotoReady(page, PAGE);
		// The problems are there (with sign-in hints), so the page has rendered.
		await expect(
			page.getByRole('link', { name: 'Sign in to track problem T1', exact: true })
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'Filter by topic', exact: true })).toBeVisible();
		// "Signed-in only; anonymous visitors have no progress to filter" (+page.svelte).
		await expect(page.getByRole('button', { name: /^Filter by progress/ })).toHaveCount(0);
	});
});

/** Tracks an alpha problem through the action, to arrange a test's starting state. */
async function track(
	request: APIRequestContext,
	year: number,
	number: string,
	intent: 'complete' | 'save' | 'remove',
	score = ''
): Promise<void> {
	await postAction(
		request,
		ACTION,
		{ intent, year: String(year), number, score },
		{ success: true }
	);
}

/** A button in the open tracking popover. Only one popover is open at a time. */
function popoverButton(page: Page, name: 'Save' | 'Mark done' | 'Remove'): Locator {
	return page.getByRole('button', { name, exact: true });
}

/** Closes the open tracking popover. */
async function closePopover(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	await expect(popoverButton(page, 'Save')).toBeHidden();
}

test.describe('tracking while the progress request is in flight', () => {
	test.use({ role: 'progressRacer' });

	test.beforeEach(async ({ request }) => {
		// The state the server holds when the page asks for it: T1 scored, T3 done,
		// T2 untracked, and 2020's problem 1 scored. Arranged here rather than
		// seeded, so the tests can run again on a reused server.
		await track(request, 2019, 'T1', 'save', '4');
		await track(request, 2019, 'T2', 'remove');
		await track(request, 2019, 'T3', 'complete');
		await track(request, 2020, '1', 'save', '3');
	});

	test('a stale snapshot does not undo problems tracked meanwhile', async ({ page, request }) => {
		// Fetched at once, delivered on release: the server reads the progress
		// before the UI changes it, so the page gets a stale snapshot, as it would
		// over a slow connection.
		let release!: () => void;
		const released = new Promise<void>((resolve) => (release = resolve));
		let snapshotTaken!: () => void;
		const taken = new Promise<void>((resolve) => (snapshotTaken = resolve));
		await page.route(
			(url) => url.pathname === PROGRESS,
			async (route) => {
				const response = await route.fetch();
				snapshotTaken();
				await released;
				await route.fulfill({ response });
			}
		);

		await gotoReady(page, PAGE);
		await taken;

		// Until the snapshot lands, every problem looks untracked. Change three, in
		// all three ways a key can differ from the snapshot:
		// T1, done with 4 in the snapshot: marked done, so no score.
		await control(page, 'Mark problem T1 as done').click();
		await popoverButton(page, 'Mark done').click();
		await expect(control(page, 'Problem T1 — done, no score recorded')).toBeVisible();
		await closePopover(page);

		// T2, absent from the snapshot: scored.
		await control(page, 'Mark problem T2 as done').click();
		await page.getByLabel('Score for T2, out of 10').fill('7');
		await popoverButton(page, 'Save').click();
		await expect(control(page, 'Problem T2 — 7 out of 10')).toBeVisible();
		await closePopover(page);

		// T3, done in the snapshot: marked done, then removed. Last, so a fix that
		// re-applied only the last action result would keep this one and lose the
		// others.
		await control(page, 'Mark problem T3 as done').click();
		await popoverButton(page, 'Mark done').click();
		await popoverButton(page, 'Remove').click();
		await expect(control(page, 'Mark problem T3 as done')).toBeVisible();
		await closePopover(page);

		// The snapshot hasn't landed: problem 1, which nobody touched, still looks
		// untracked.
		await expect(control(page, 'Mark problem 1 as done')).toBeVisible();
		release();
		// Now it has: problem 1 shows its snapshot score.
		await expect(control(page, 'Problem 1 — 3')).toBeVisible();

		// "Re-apply keys changed since the request went out. Don't leave this to the
		// merge effect below: `form` holds only the last result, so two problems
		// tracked meanwhile would come back as one" (+page.svelte). And T3 stays
		// removed: "Not a spread merge, because a removal is an absent key and a
		// spread would bring it back" (the `touched` set's comment).
		await expectListed(page, 2019, [
			'Problem T1 — done, no score recorded',
			'Problem T2 — 7 out of 10',
			'Mark problem T3 as done'
		]);
		await expect(yearPanel(page, 2019).getByText('2/3 done', { exact: true })).toBeVisible();
		await expect(yearPanel(page, 2019).getByText('7 / 10', { exact: true })).toBeVisible();

		// What the page shows is what was stored.
		const stored = await request.get(PROGRESS);
		expect(stored.status()).toBe(200);
		expect(await stored.json()).toEqual({
			'2019:T1': { score: null },
			'2019:T2': { score: 7 },
			'2020:1': { score: 3 }
		});
	});

	test('under To do, a problem leaves the list as soon as it is tracked', async ({ page }) => {
		await gotoReady(page, PAGE);
		await expectListed(page, 2019, [
			'Problem T1 — 4 out of 10',
			'Mark problem T2 as done',
			'Problem T3 — done, no score recorded'
		]);
		await filterByStatus(page, 'All problems', 'To do');
		await expectListed(page, 2019, ['Mark problem T2 as done']);

		await control(page, 'Mark problem T2 as done').click();
		await popoverButton(page, 'Mark done').click();

		// "under "To do" a problem leaves the list as soon as it's tracked, closing
		// its popover. That is intended" (+page.svelte). 2019 had nothing else to do,
		// so its panel goes too.
		await expect(yearPanel(page, 2019)).toHaveCount(0);
		await expect(popoverButton(page, 'Mark done')).toBeHidden();
		await expectListed(page, 2020, ['Mark problem 2 as done']);
	});
});

test.describe('navigating between olympiads', () => {
	test('a late response for the olympiad left behind never shows its years', async ({ page }) => {
		// Hold alpha's years until the page has moved on to beta.
		let release!: () => void;
		const released = new Promise<void>((resolve) => (release = resolve));
		await page.route(
			(url) => url.pathname === '/api/olympiads/alpha',
			async (route) => {
				await released;
				await route.continue();
			}
		);

		// The guard drops the response without a trace, so nothing on the page says
		// it has run. This flag does: it is set a task after the page's `r.json()`
		// for alpha resolves, by which time the page's handler has run and Svelte
		// has flushed whatever it changed (a microtask).
		await page.addInitScript(() => {
			const json = Response.prototype.json;
			Response.prototype.json = function (this: Response) {
				const body = json.call(this);
				if (new URL(this.url).pathname === '/api/olympiads/alpha') {
					void body.then(() =>
						setTimeout(() => document.documentElement.setAttribute('data-alpha-read', ''))
					);
				}
				return body;
			};
		});

		await gotoReady(page, PAGE);
		await expect(
			page.getByRole('heading', { name: 'Alpha Physics Olympiad', exact: true })
		).toBeVisible();
		// Still loading: the request is held.
		await expect(yearPanel(page, 2019)).toHaveCount(0);

		// Client-side to beta through ⌘K, which `goto`s. The same route, so the page
		// component is reused and only `olympiad.id` changes.
		const dialog = await openSearch(page);
		await dialog.getByRole('searchbox').fill('beta spring');
		await dialog.locator('[data-result-index]').filter({ hasText: 'Beta Spring' }).click();
		await expect(page).toHaveURL(/\/olympiads\/beta#2021$/);
		await expect(
			page.getByRole('heading', { name: 'Beta Physics Olympiad', exact: true })
		).toBeVisible();
		await expect(yearPanel(page, 2021).getByText('Beta Spring', { exact: true })).toBeVisible();

		release();
		await expect(page.locator('html')).toHaveAttribute('data-alpha-read', '');

		// "The component is reused across olympiads, so drop a response for one the
		// user has navigated away from" (+page.svelte).
		await expect(yearPanel(page, 2019)).toHaveCount(0);
		await expect(yearPanel(page, 2020)).toHaveCount(0);
		await expect(page.getByText('Rolling Cylinder', { exact: true })).toHaveCount(0);
		await expect(yearPanel(page, 2021).getByText('Beta Spring', { exact: true })).toBeVisible();
	});
});
