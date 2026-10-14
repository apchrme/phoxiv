import type { Locator, Page, Route } from '@playwright/test';
import { CDN_BASE_URL } from '../../../../src/lib/constants';
import { OLYMPIAD_TAGS, type OlympiadEntry, type OlympiadTag } from '../../../../src/lib/types';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The olympiads index, src/routes/(reg)/olympiads/+page.svelte: one card per
 * olympiad from `/api/olympiads`, in display order, narrowed by a search box and
 * a tag toggle, with its own loading, failed and empty states.
 *
 * Reads frozen olympiads, and two this spec owns (`e2e-idx-tie-*`, which tie on
 * display order). Writes nothing. Other specs create olympiads, so no test here
 * counts every card or checks the order of any but these.
 */

/** Frozen olympiads in the order the page must show them: display order, then id. */
const FROZEN = [
	{ id: 'alpha', name: 'Alpha Physics Olympiad', tag: 'International' },
	{ id: 'beta', name: 'Beta Physics Olympiad', tag: 'Regional' },
	// Sorts first by id, but its display order puts it after beta.
	{ id: 'aardvark', name: 'Aardvark Physics Olympiad', tag: 'Open' },
	{ id: 'delta', name: 'Delta Physics Olympiad', tag: 'National' },
	{ id: 'delta-w', name: 'Delta Physics Olympiad (Women)', tag: 'National' },
	{ id: 'e2e-assigned', name: 'Assigned Physics Olympiad', tag: 'Open' },
	{ id: 'e2e-sentinel', name: 'E2E Sentinel Olympiad', tag: 'Open' }
] as const satisfies readonly { id: string; name: string; tag: OlympiadTag }[];

/**
 * This spec's own pair, seeded with the same display order. Their ids put
 * `-a` first; their names and their insertion order put `-b` first.
 */
const TIED = [
	{ id: 'e2e-idx-tie-a', name: 'Yankee Tiebreak Olympiad' },
	{ id: 'e2e-idx-tie-b', name: 'Xray Tiebreak Olympiad' }
] as const;

/** Every olympiad whose relative order is asserted, in that order. */
const ORDERED_IDS: string[] = [
	...FROZEN.slice(0, -1).map((o) => o.id),
	// Display order 50: after e2e-assigned (40), before the sentinel (9000).
	...TIED.map((o) => o.id),
	FROZEN[FROZEN.length - 1].id
];

const EMPTY = 'No olympiads found';
const EMPTY_HINT = 'Try a different search term, or clear the filter.';
const FAILED = "Couldn't load the olympiads";
const FAILED_HINT = 'Something went wrong fetching the list. Reloading usually fixes it.';

function main(page: Page): Locator {
	return page.getByRole('main');
}

/** Every card's link. A card has no role, so it is found by the vendored Card's `data-slot`. */
function cardLinks(page: Page): Locator {
	return main(page)
		.getByRole('link')
		.filter({ has: page.locator('[data-slot="card"]') });
}

/**
 * The card for the olympiad named `name`, by its heading. Exact, since "Delta
 * Physics Olympiad" is a prefix of another seeded name.
 */
function card(page: Page, name: string): Locator {
	return cardLinks(page).filter({ has: page.getByRole('heading', { name, exact: true }) });
}

function searchBox(page: Page): Locator {
	return main(page).getByRole('searchbox');
}

/** A tag toggle. bits-ui renders a single-choice toggle group's items as `radio`s. */
function tagToggle(page: Page, label: 'All' | OlympiadTag): Locator {
	return main(page).getByRole('radio', { name: label, exact: true });
}

/** Opens the index and waits for the first card, so the fetch has landed. */
async function openIndex(page: Page): Promise<void> {
	await gotoReady(page, '/olympiads');
	await expect(card(page, FROZEN[0].name)).toBeVisible();
}

/** The ids the cards link to, in page order, keeping only those in `ORDERED_IDS`. */
async function orderedCardIds(page: Page): Promise<string[]> {
	const hrefs = await cardLinks(page).evaluateAll((links) =>
		links.map((link) => link.getAttribute('href') ?? '')
	);
	const ids = hrefs.map((href) => href.replace(/^\/olympiads\//, ''));
	return ids.filter((id) => ORDERED_IDS.includes(id));
}

function isOlympiadList(url: URL): boolean {
	return url.pathname === '/api/olympiads';
}

test.describe('the olympiads index', () => {
	test('a card shows the name, tag, emoji and summary, and opens the olympiad', async ({
		page
	}) => {
		await openIndex(page);
		const alpha = card(page, 'Alpha Physics Olympiad');

		await expect(alpha).toHaveAttribute('href', '/olympiads/alpha');
		await expect(alpha.locator('[data-slot="badge"]')).toHaveText('International');
		await expect(alpha.getByText('The main frozen olympiad.', { exact: true })).toBeVisible();
		await expect(alpha.getByText('View archive')).toBeVisible();
		// A plain emoji renders as text, hidden from assistive tech: the name says it all.
		await expect(alpha.getByText('🅰️', { exact: true })).toBeVisible();
		await expect(alpha.getByText('🅰️', { exact: true })).toHaveAttribute('aria-hidden', 'true');
		// The summary, never the description: `/api/olympiads` carries
		// `descriptionHtml` for the olympiad page, not for this grid.
		await expect(alpha).not.toContainText('frozen seed data');

		await alpha.click();
		await expect(page).toHaveURL('/olympiads/alpha');
		await expect(
			page.getByRole('heading', { level: 1, name: 'Alpha Physics Olympiad' })
		).toBeVisible();
	});

	test('every card links to its own olympiad page', async ({ page }) => {
		await openIndex(page);
		for (const { id, name } of [...FROZEN, ...TIED]) {
			await expect(card(page, name), id).toHaveAttribute('href', `/olympiads/${id}`);
		}
	});

	test('cards are in display order, then by id', async ({ page }) => {
		await openIndex(page);
		// Relative order only: other specs add olympiads anywhere in the list. The
		// tied pair is ordered by `listOlympiads`'s "id as a stable tiebreaker"
		// (src/lib/server/db/queries/olympiads.ts), and by nothing else that could
		// pass for it.
		await expect.poll(() => orderedCardIds(page)).toEqual(ORDERED_IDS);
	});

	test.describe('the search box', () => {
		test('matches names, ignoring case and surrounding spaces', async ({ page }) => {
			await openIndex(page);
			await searchBox(page).fill('  DELTA physics  ');
			await expect(card(page, 'Delta Physics Olympiad')).toBeVisible();
			await expect(card(page, 'Delta Physics Olympiad (Women)')).toBeVisible();
			await expect(card(page, 'Alpha Physics Olympiad')).toHaveCount(0);
			await expect(card(page, 'Beta Physics Olympiad')).toHaveCount(0);

			// Cleared: the list is back.
			await searchBox(page).fill('');
			await expect(card(page, 'Alpha Physics Olympiad')).toBeVisible();
		});

		test('matches an id and a summary as well as a name', async ({ page }) => {
			await openIndex(page);

			// In e2e-assigned's id only: its name is "Assigned Physics Olympiad".
			await searchBox(page).fill('e2e-assigned');
			await expect(card(page, 'Assigned Physics Olympiad')).toBeVisible();
			await expect(card(page, 'Alpha Physics Olympiad')).toHaveCount(0);

			// In aardvark's summary only.
			await searchBox(page).fill('ordered by display order');
			await expect(card(page, 'Aardvark Physics Olympiad')).toBeVisible();
			await expect(card(page, 'Assigned Physics Olympiad')).toHaveCount(0);
			await expect(card(page, 'Alpha Physics Olympiad')).toHaveCount(0);
		});
	});

	test.describe('the tag toggle', () => {
		test('starts on All', async ({ page }) => {
			await openIndex(page);
			await expect(tagToggle(page, 'All')).toBeChecked();
			for (const tag of OLYMPIAD_TAGS) await expect(tagToggle(page, tag)).not.toBeChecked();
			for (const { name } of FROZEN) await expect(card(page, name)).toBeVisible();
		});

		for (const tag of OLYMPIAD_TAGS) {
			// Every tag has at least one frozen olympiad, so `shown` is never empty.
			const shown = FROZEN.filter((o) => o.tag === tag).map((o) => o.name);
			const hidden = FROZEN.filter((o) => o.tag !== tag).map((o) => o.name);

			test(`${tag} shows only ${tag} olympiads`, async ({ page }) => {
				await openIndex(page);
				await tagToggle(page, tag).click();
				await expect(tagToggle(page, tag)).toBeChecked();
				await expect(tagToggle(page, 'All')).not.toBeChecked();

				for (const name of shown) await expect(card(page, name)).toBeVisible();
				for (const name of hidden) await expect(card(page, name)).toHaveCount(0);
				// Any olympiad another spec added is held to the same rule: no card
				// left on screen carries another tag.
				const badge = page
					.locator('[data-slot="badge"]')
					.filter({ hasText: new RegExp(`^${tag}$`) });
				await expect(cardLinks(page).filter({ hasNot: badge })).toHaveCount(0);
			});
		}

		test('clicking the selected tag again, or All, shows every tag', async ({ page }) => {
			await openIndex(page);
			const alpha = card(page, 'Alpha Physics Olympiad');

			await tagToggle(page, 'Regional').click();
			await expect(alpha).toHaveCount(0);
			// A single toggle group deselects on a second click, and the page reads
			// the empty value as "no tag".
			await tagToggle(page, 'Regional').click();
			await expect(tagToggle(page, 'All')).toBeChecked();
			await expect(alpha).toBeVisible();

			await tagToggle(page, 'National').click();
			await expect(alpha).toHaveCount(0);
			await tagToggle(page, 'All').click();
			await expect(tagToggle(page, 'All')).toBeChecked();
			await expect(tagToggle(page, 'National')).not.toBeChecked();
			await expect(alpha).toBeVisible();
		});

		test('combines with the search box: both must match', async ({ page }) => {
			await openIndex(page);
			await searchBox(page).fill('delta');
			await tagToggle(page, 'National').click();
			await expect(card(page, 'Delta Physics Olympiad')).toBeVisible();
			await expect(card(page, 'Delta Physics Olympiad (Women)')).toBeVisible();

			// The query alone would still match both; the tag rules them out.
			await tagToggle(page, 'International').click();
			await expect(card(page, 'Delta Physics Olympiad')).toHaveCount(0);
			await expect(card(page, 'Delta Physics Olympiad (Women)')).toHaveCount(0);
			// And the tag alone would still match alpha; the query rules it out.
			await expect(card(page, 'Alpha Physics Olympiad')).toHaveCount(0);
		});
	});

	test('no match shows the empty state, and Clear filters resets both filters', async ({
		page
	}) => {
		await openIndex(page);
		await tagToggle(page, 'National').click();
		await searchBox(page).fill('no olympiad is called this');

		await expect(main(page).getByText(EMPTY, { exact: true })).toBeVisible();
		await expect(main(page).getByText(EMPTY_HINT, { exact: true })).toBeVisible();
		await expect(cardLinks(page)).toHaveCount(0);

		await main(page).getByRole('button', { name: 'Clear filters' }).click();
		await expect(searchBox(page)).toHaveValue('');
		await expect(tagToggle(page, 'All')).toBeChecked();
		await expect(tagToggle(page, 'National')).not.toBeChecked();
		// Alpha is International, so the tag was cleared as well as the query.
		await expect(card(page, 'Alpha Physics Olympiad')).toBeVisible();
		await expect(main(page).getByText(EMPTY, { exact: true })).toBeHidden();
	});

	test.describe('fetching the list', () => {
		test('shows skeletons, not "no olympiads", while the list is on its way', async ({ page }) => {
			// Held until the assertions have passed: a local fetch answers too fast
			// to see the skeletons otherwise.
			let release!: () => void;
			const released = new Promise<void>((resolve) => (release = resolve));
			await page.route(isOlympiadList, async (route) => {
				await released;
				await route.continue();
			});

			await gotoReady(page, '/olympiads');
			const skeletons = main(page).locator('[data-slot="skeleton"]');
			await expect(skeletons).toHaveCount(6);
			await expect(main(page).getByText(EMPTY)).toBeHidden();
			await expect(main(page).getByText(FAILED)).toBeHidden();
			await expect(cardLinks(page)).toHaveCount(0);

			release();
			await expect(card(page, 'Alpha Physics Olympiad')).toBeVisible();
			await expect(skeletons).toHaveCount(0);
		});

		// Each failure must end on the error state: not on skeletons, and not on
		// "no olympiads found", which would tell the visitor the archive is empty.
		const failures: { name: string; fail: (route: Route) => Promise<void> }[] = [
			{
				// "Check `res.ok` before `res.json()`, so an error page … shows as a
				// failure, not as 'no data'" (src/lib/resource.svelte.ts). The body is
				// a valid empty list, so only the status says it failed.
				name: 'an error status with a JSON body',
				fail: (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '[]' })
			},
			{
				// "Use `Resource` rather than a hand-rolled fetch: it always clears
				// `loading`, even on failure" (+page.svelte), "so no error path can
				// leave the page stuck on skeletons" (src/lib/resource.svelte.ts).
				name: 'a network failure',
				fail: (route) => route.abort('failed')
			}
		];

		for (const { name, fail } of failures) {
			test(`${name} shows the error state, and Reload recovers`, async ({ page }) => {
				await page.route(isOlympiadList, fail);
				await gotoReady(page, '/olympiads');

				await expect(main(page).getByText(FAILED, { exact: true })).toBeVisible();
				await expect(main(page).getByText(FAILED_HINT, { exact: true })).toBeVisible();
				await expect(main(page).locator('[data-slot="skeleton"]')).toHaveCount(0);
				await expect(main(page).getByText(EMPTY)).toBeHidden();
				await expect(cardLinks(page)).toHaveCount(0);

				await page.unroute(isOlympiadList);
				await main(page).getByRole('button', { name: 'Reload' }).click();
				await expect(card(page, 'Alpha Physics Olympiad')).toBeVisible();
				await expect(main(page).getByText(FAILED)).toBeHidden();
			});
		}
	});

	test('icons: a local override, a flag and an uploaded image', async ({
		page,
		blockedRequests
	}) => {
		// Served in place of `/api/olympiads`, not seeded. A seeded flag or image
		// icon would make the harness's "no request leaves loopback" fail on this
		// page, and a local override needs an id like `ipho`, outside this spec's
		// `e2e-idx` prefix. Only the rendering is under test here.
		const iconUrl = `${CDN_BASE_URL}/olympiads/e2e-idx-image/icon.png`;
		const entries: OlympiadEntry[] = [
			{
				id: 'ipho',
				name: 'Override Olympiad',
				summary: 'Has a local icon.',
				icon: '🌍',
				tag: 'International'
			},
			{
				id: 'e2e-idx-flag',
				name: 'Flag Olympiad',
				summary: 'A flag emoji.',
				icon: '🇸🇬',
				tag: 'National'
			},
			{
				id: 'e2e-idx-image',
				name: 'Image Olympiad',
				summary: 'An uploaded icon.',
				icon: iconUrl,
				tag: 'Open'
			}
		];
		await page.route(isOlympiadList, (route) => route.fulfill({ json: entries }));
		await gotoReady(page, '/olympiads');

		// src/lib/assets/icons/olympiads/ipho.png, fingerprinted by Vite, wins over the emoji.
		const override = card(page, 'Override Olympiad').getByRole('img', { name: '🌍' });
		await expect(override).toHaveAttribute('src', /\/ipho\.[\w-]+\.png$/);

		// "Not a raw emoji: Windows shows flag emoji as two letters" (+page.svelte).
		// The flag is asked of flagcdn.com, which the suite blocks, so the image
		// fails and the card falls back to the emoji rather than to nothing.
		await expect.poll(() => blockedRequests).toContain('https://flagcdn.com/sg.svg');
		await expect(card(page, 'Flag Olympiad').getByText('🇸🇬', { exact: true })).toBeVisible();

		// An uploaded icon is the image itself, named by the olympiad's id.
		await expect(
			card(page, 'Image Olympiad').getByRole('img', { name: 'e2e-idx-image' })
		).toHaveAttribute('src', iconUrl);
	});
});
