import type { APIRequestContext, Locator, Page, Response } from '@playwright/test';
import { LOG_PAGING_ENTRIES } from '../../fixtures/seed-data';
import { postAction } from '../../support/actions';
import { sessionCookie } from '../../support/auth';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The admin Log tab's "Load more" (src/routes/admin/ActivityLogTable.svelte),
 * which fetches older pages from admin/activity/+server.ts, "keyed on
 * `?before=<id>`". The cursor is the row id, never the timestamp: the seed's
 * LOG_PAGING_ENTRIES hold a run of 30 rows with one exact `created_at`, and a
 * page seam always falls inside that run, where a cursor on the timestamp alone
 * would skip the rest of the run (`<`) or repeat it (`<=`). activity-log.ts:
 * "Don't switch to ordering by `created_at`".
 *
 * Owns LOG_PAGING_ENTRIES (fixtures/seed-data.ts) and only reads them. Other
 * specs log rows while this one runs, always with higher ids, so they push these
 * rows down the log, by a different amount each run. No assertion reads a total
 * or the newest rows: only this spec's own rows, by their unique details. One
 * test creates the per-test olympiad `e2e-created-log`.
 */

test.use({ role: 'admin' });

/**
 * Rows per page: `LOG_PAGE_SIZE` in admin/+page.server.ts for page 1 and
 * `DEFAULT_LIMIT` in admin/activity/+server.ts after it. If it changes, check
 * the seed's tied run is still longer than a page, so a seam falls inside it.
 */
const PAGE_SIZE = 25;

/** The endpoint "Load more" fetches. Under `/admin`, so never shared-cached. */
const ACTIVITY = '/admin/activity';

/** Enough presses for 40 pages, so a cursor that never advances fails instead of looping. */
const MAX_PRESSES = 40;

const LOAD_FAILED = 'Could not load more entries.';

type Entry = { id: number; detail: string; createdAt: string };
type LogPage = { entries: Entry[]; hasMore: boolean };
/** One "Load more" fetch: the URL the page sent, its cursor, and the page it got. */
type Fetched = { url: string; before: number; page: LogPage };

/** This spec's details, newest (highest id) first, as the log lists them. */
const OWN_NEWEST_FIRST = LOG_PAGING_ENTRIES.map((entry) => entry.detail).reverse();

/** The ids of the run of rows that share one `created_at`. */
const TIED_IDS = new Set(LOG_PAGING_ENTRIES.filter((e) => e.tied).map((e) => e.id));

function isActivity(response: Response): boolean {
	return new URL(response.url()).pathname === ACTIVITY;
}

/** The Log tab's panel. bits-ui mounts every tab at once; the others are hidden. */
function logPanel(page: Page): Locator {
	return page.getByRole('tabpanel', { name: 'Log' });
}

/**
 * The idle "Load more" button. While a page loads, its spinner (`role="status"`,
 * `aria-label="Loading"`) makes it "Loading Load more", so this exact name
 * matches only when it is idle, and a click waits until it is.
 */
function loadMore(page: Page): Locator {
	return logPanel(page).getByRole('button', { name: 'Load more', exact: true });
}

/** This spec's rows on screen, in order: their Details cells, matched exactly. */
function ownDetails(page: Page): Locator {
	return logPanel(page).getByRole('cell', { name: /^e2e-log entry \d{2}$/ });
}

/** Opens /admin on the Log tab, with page 1 from the load on screen. */
async function openLog(page: Page): Promise<void> {
	await gotoReady(page, '/admin');
	const tab = page.getByRole('tab', { name: 'Log' });
	await tab.click();
	await expect(tab).toHaveAttribute('aria-selected', 'true');
	// A full page plus the header row, with more behind it: the seed alone has
	// more than two pages.
	await expect(logPanel(page).getByRole('row')).toHaveCount(PAGE_SIZE + 1);
	await expect(loadMore(page)).toBeEnabled();
}

/** Presses "Load more" once and returns the response to the fetch it sent. */
async function press(page: Page): Promise<Response> {
	const answered = page.waitForResponse(isActivity);
	await loadMore(page).click();
	return answered;
}

/** A successful fetch, parsed. */
async function expectPage(response: Response): Promise<Fetched> {
	const url = response.url();
	expect(response.status(), url).toBe(200);
	const before = Number(new URL(url).searchParams.get('before'));
	return { url, before, page: (await response.json()) as LogPage };
}

/**
 * Presses "Load more" until the last page, and returns every fetch in order.
 * Then the button must be gone: `{#if hasMore}` removes it.
 */
async function expectEveryPageLoaded(page: Page): Promise<Fetched[]> {
	const fetched: Fetched[] = [];
	for (let i = 0; i < MAX_PRESSES; i++) {
		const next = await expectPage(await press(page));
		fetched.push(next);
		if (!next.page.hasMore) break;
	}
	expect(fetched.at(-1)?.page.hasMore, 'the last fetch says there is no more').toBe(false);
	// Any name, so a button still busy ("Loading Load more") can't pass for gone.
	await expect(logPanel(page).getByRole('button', { name: /Load more/ })).toHaveCount(0);
	await expect(page.getByText(LOAD_FAILED)).toHaveCount(0);
	return fetched;
}

/**
 * Checks that the fetches tile the log: each page is newest first, entirely
 * below its cursor (so nothing on screen comes back), full until the last, and
 * each cursor is the last row of the page before it.
 */
function expectContiguous(fetched: Fetched[]): void {
	fetched.forEach(({ before, page }, i) => {
		const where = `fetch ${i + 1}, before=${before}`;
		const ids = page.entries.map((e) => e.id);
		expect(ids, where).toEqual([...new Set(ids)].sort((a, b) => b - a));
		expect(Math.max(...ids), where).toBeLessThan(before);
		if (page.hasMore) expect(ids, where).toHaveLength(PAGE_SIZE);
		// ActivityLogTable.svelte: "The cursor is the minimum of everything on
		// screen, not of page 1." A cursor from page 1 would fetch page 2 again.
		if (i > 0) expect(before, where).toBe(fetched[i - 1].page.entries.at(-1)?.id);
	});
}

/**
 * The fetch whose cursor and first row are both in the tied run: the seam the
 * seed puts inside it. Its first row must be the very next id, so the seam
 * neither repeats nor skips a row.
 */
function expectSeamInsideTiedRun(fetched: Fetched[]): Fetched {
	const seam = fetched.find(
		({ before, page }) => TIED_IDS.has(before) && TIED_IDS.has(page.entries[0]?.id ?? 0)
	);
	expect(seam, 'a page seam inside the tied run (LOG_PAGING_ENTRIES)').toBeDefined();
	const { before, page } = seam as Fetched;
	expect(page.entries[0].id, 'the row right below the cursor').toBe(before - 1);
	return seam as Fetched;
}

/** The URL of every activity fetch the page sends from now on. */
function recordFetches(page: Page): string[] {
	const sent: string[] = [];
	page.on('request', (request) => {
		if (new URL(request.url()).pathname === ACTIVITY) sent.push(request.url());
	});
	return sent;
}

/**
 * Holds the page's activity fetches until the returned function is called, as
 * `holdAction()` (support/ui.ts) does for form actions: a local fetch answers
 * too fast to see the busy state. Released, the route lets everything through.
 */
async function holdFetches(page: Page): Promise<() => void> {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route(
		(url) => url.pathname === ACTIVITY,
		async (route) => {
			await released;
			await route.continue();
		}
	);
	return release;
}

/** GETs an activity page as the signed-in admin, outside the page. */
async function getLog(api: APIRequestContext, path: string): Promise<LogPage> {
	const response = await api.get(path);
	expect(response.status(), path).toBe(200);
	return (await response.json()) as LogPage;
}

test.describe('the Log tab', () => {
	test('Load more lists every row once, in order, across a seam inside a run of equal timestamps', async ({
		page,
		request
	}) => {
		// The fixture first: the tied run really shares one stored timestamp. The
		// endpoint's own `limit` reads exactly the run, from just above its top id.
		const tied = [...TIED_IDS];
		const run = await getLog(request, `${ACTIVITY}?before=${Math.max(...tied) + 1}&limit=30`);
		expect(run.entries.map((e) => e.id)).toEqual(tied.sort((a, b) => b - a));
		expect(new Set(run.entries.map((e) => e.createdAt)).size).toBe(1);

		await openLog(page);
		const fetched = await expectEveryPageLoaded(page);

		// Every seeded row exactly once, newest first. A skipped row would be
		// missing here; a repeated one would show twice, or make the keyed
		// `{#each}` throw (admin/activity/+server.ts: "its keyed `{#each}` would
		// throw"), which fails the test as a page error.
		await expect(ownDetails(page)).toHaveText(OWN_NEWEST_FIRST);

		expectContiguous(fetched);
		const seam = expectSeamInsideTiedRun(fetched);
		// Both sides of that seam carry the run's one timestamp.
		expect(seam.page.entries[0].createdAt).toBe(run.entries[0].createdAt);

		// The page's own cursors, replayed outside the page, return the same pages:
		// a cursor is a fixed point in the log, however many rows arrive above it.
		for (const { url, page: shown } of fetched) {
			expect(await getLog(request, url)).toEqual(shown);
		}
	});

	test('a row logged after page 1 loaded shifts no later page', async ({ page, request }) => {
		await openLog(page);

		// A logged write between page 1 and "Load more". activity-log.ts: "Pages by
		// `id` rather than OFFSET", because "new inserts would shift pages": with an
		// offset, the next page would start with page 1's last row again.
		const id = 'e2e-created-log';
		await postAction(
			request,
			'/contribute?/createOlympiad',
			{
				id,
				icon: '🧾',
				name: 'Log Shift Physics Olympiad',
				summary: 'Created by admin/activity-log.spec.ts.',
				tag: 'Open',
				year: '2024'
			},
			{ redirect: `/contribute/${id}/2024` }
		);
		// The write was logged (a positive control), above the row the page's
		// first cursor will name.
		const newest = await getLog(request, `${ACTIVITY}?limit=100`);
		const logged = newest.entries.filter(
			(e) => e.detail === `Created "Log Shift Physics Olympiad" (${id})`
		);
		expect(logged).toHaveLength(1);

		const fetched = await expectEveryPageLoaded(page);
		await expect(ownDetails(page)).toHaveText(OWN_NEWEST_FIRST);
		expectContiguous(fetched);
		// ActivityLogTable.svelte: "Ids in `extra` are always below page 1's".
		expect(fetched[0].before).toBeLessThan(logged[0].id);
		expect(fetched.flatMap((f) => f.page.entries.map((e) => e.id))).not.toContain(logged[0].id);
	});

	test('Load more is disabled while a page loads, and a failed page can be retried', async ({
		page,
		context
	}) => {
		await openLog(page);
		const rows = logPanel(page).getByRole('row');
		const sent = recordFetches(page);

		// Held, so the in-flight window lasts until the assertions pass. A second
		// press now would fetch the same cursor twice, and the duplicate ids would
		// make the keyed `{#each}` throw (admin/activity/+server.ts).
		const release = await holdFetches(page);
		const held = press(page);
		await expect(logPanel(page).getByRole('button', { name: 'Loading Load more' })).toBeDisabled();
		release();
		const second = await expectPage(await held);
		await expect(rows).toHaveCount(2 * PAGE_SIZE + 1);
		await expect(loadMore(page)).toBeEnabled();
		expect(sent).toEqual([second.url]);

		// The session ends: the endpoint refuses, as requireAdmin does for anyone
		// signed out. ActivityLogTable.svelte checks `res.ok` first, for "an HTML
		// error body (e.g. a 403 after the session expires)"; the page must say the
		// load failed and keep what it has.
		await context.clearCookies();
		const refused = await press(page);
		expect(refused.status()).toBe(403);
		expect(await refused.text()).toContain('Unauthorised');
		await expect(logPanel(page).getByText(LOAD_FAILED)).toBeVisible();
		await expect(rows).toHaveCount(2 * PAGE_SIZE + 1);

		// Signed in again, a retry asks for the same cursor and clears the message.
		await context.addCookies([sessionCookie('admin')]);
		const retried = await expectPage(await press(page));
		expect(new URL(refused.url()).searchParams.get('before')).toBe(String(retried.before));
		expect(retried.before).toBe(second.page.entries.at(-1)?.id);
		await expect(logPanel(page).getByText(LOAD_FAILED)).toHaveCount(0);
		await expect(rows).toHaveCount(2 * PAGE_SIZE + 1 + retried.page.entries.length);
	});
});
