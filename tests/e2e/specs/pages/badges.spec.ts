import type { Page } from '@playwright/test';
import { BADGE_OLYMPIAD, BADGES } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * `/badges`: the catalogue and holder counts from the shared-cached
 * `/api/badges`, and the viewer's own standing from the uncached
 * `/progress/badges` (src/routes/(reg)/badges/+page.svelte).
 *
 * Reads USERS.badgeReader and the frozen BADGES. Only `tracker`'s holder count
 * moves during a run (olympiads/progress-badges.spec.ts), so it isn't checked.
 */

/** The card of the badge named `name`. */
function card(page: Page, name: string) {
	return page
		.getByTestId('badge-card')
		.filter({ has: page.getByRole('heading', { name, exact: true }) });
}

/** The toolbar's search box. */
const searchBox = (page: Page) => page.getByRole('searchbox');

/** The standing filter's trigger, named by its current choice. */
const standingTrigger = (page: Page) => page.getByRole('button', { name: /^Filter by standing/ });

/** Pick `option` from the standing filter. */
async function filterByStanding(page: Page, option: string) {
	await standingTrigger(page).click();
	await page.getByRole('menuitemradio', { name: option, exact: true }).click();
	await expect(standingTrigger(page)).toHaveAccessibleName(`Filter by standing: ${option}`);
}

const FROZEN = [BADGES.thermo, BADGES.field, BADGES.sharp, BADGES.steady, BADGES.picked];
/** Requirement hidden: one in progress, one earned. */
const HIDDEN = [BADGES.secret, BADGES.egg];

test.describe('signed out', () => {
	test('every badge, its criteria and how many hold it', async ({ page }) => {
		await gotoReady(page, '/badges');
		await expect(card(page, BADGES.thermo.name)).toContainText(
			'Complete 2 Badge Physics Olympiad Thermodynamics problems'
		);
		await expect(card(page, BADGES.thermo.name)).toContainText('Feel the heat.');
		await expect(card(page, BADGES.field.name)).toContainText(
			'Complete 4 Badge Physics Olympiad Mechanics or Electromagnetism problems'
		);
		await expect(card(page, BADGES.sharp.name)).toContainText(
			'Complete 3 Badge Physics Olympiad problems, scoring at least 85%'
		);
		await expect(card(page, BADGES.steady.name)).toContainText(
			'Complete 3 Badge Physics Olympiad problems, scoring 80%–90%'
		);
		await expect(card(page, BADGES.picked.name)).toContainText(
			'Complete 1 of the selected problems'
		);

		for (const badge of [...FROZEN, ...HIDDEN]) {
			await expect(card(page, badge.name), badge.name).toContainText(
				`Earned by ${badge.holders} ${badge.holders === 1 ? 'person' : 'people'}`
			);
			// No standing without a session: no progress bar, no "Earned on".
			await expect(card(page, badge.name).getByRole('meter')).toHaveCount(0);
		}
	});

	test('a hidden requirement shows the badge but not the rule', async ({ page }) => {
		await gotoReady(page, '/badges');
		const secret = card(page, BADGES.secret.name);
		await expect(secret).toContainText('Not telling.');
		await expect(secret).toContainText('Requirement hidden');
		await expect(secret).not.toContainText('Complete');
		// Held by someone, but not by a signed-out viewer: still hidden.
		await expect(card(page, BADGES.egg.name)).toContainText('Requirement hidden');
	});

	test('most held first', async ({ page }) => {
		await gotoReady(page, '/badges');
		// The cards come from a fetch, and allTextContents() doesn't wait for them.
		await expect(card(page, BADGES.field.name)).toBeVisible();
		const names = await page.getByTestId('badge-card').getByRole('heading').allTextContents();
		// The seeded holders are one each for thermo, sharp, picked and egg, then
		// none; ties go oldest first. `tracker` can gain a holder mid-run, and other
		// specs' badges come and go, so only these are compared.
		const seeded = [BADGES.thermo, BADGES.sharp, BADGES.picked, BADGES.egg, BADGES.field];
		const order = seeded.map((b) => names.indexOf(b.name));
		expect(order.every((n) => n >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});

	test('search matches the name, description or requirement', async ({ page }) => {
		await gotoReady(page, '/badges');
		// Signed out there is no standing to filter on.
		await expect(standingTrigger(page)).toHaveCount(0);

		for (const [needle, badge] of [
			['seeker', BADGES.thermo],
			['FEEL THE', BADGES.thermo],
			['electromagnetism', BADGES.field]
		] as const) {
			await searchBox(page).fill(needle);
			await expect(card(page, badge.name), needle).toBeVisible();
			await expect(card(page, BADGES.steady.name), needle).toHaveCount(0);
		}
	});

	test('no match shows the empty state, and Clear filters resets it', async ({ page }) => {
		await gotoReady(page, '/badges');
		await searchBox(page).fill('no badge is called this');
		await expect(page.getByText('No badges found', { exact: true })).toBeVisible();
		await expect(page.getByTestId('badge-card')).toHaveCount(0);

		await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
		await expect(searchBox(page)).toHaveValue('');
		await expect(card(page, BADGES.thermo.name)).toBeVisible();
		await expect(page.getByText('No badges found', { exact: true })).toHaveCount(0);
	});

	// Guards "The text match covers only what the card shows" in
	// src/routes/(reg)/badges/+page.svelte: a match on a hidden rule would leak it.
	test('a hidden requirement is not searchable', async ({ page }) => {
		await gotoReady(page, '/badges');
		// `picked` and `egg` are both manual lists; only `picked`'s rule is public.
		await searchBox(page).fill('selected problems');
		await expect(card(page, BADGES.picked.name)).toBeVisible();
		await expect(card(page, BADGES.egg.name)).toHaveCount(0);
	});

	test('the nav links to it', async ({ page }) => {
		await gotoReady(page, '/olympiads');
		await page.getByRole('link', { name: 'badges', exact: true }).first().click();
		await expect(page).toHaveURL('/badges');
		await expect(page.getByRole('heading', { level: 1, name: 'Badges' })).toBeVisible();
	});
});

test.describe('signed in', () => {
	test.use({ role: 'badgeReader' });

	test('earned badges say so; the rest show progress', async ({ page }) => {
		await gotoReady(page, '/badges');
		for (const badge of FROZEN.filter((b) => b.earned)) {
			const item = card(page, badge.name);
			await expect(item, badge.name).toContainText('Earned ');
			await expect(item.getByRole('meter'), badge.name).toHaveCount(0);
		}
		for (const badge of FROZEN.filter((b) => !b.earned)) {
			const item = card(page, badge.name);
			await expect(item, badge.name).toContainText(`${badge.count}/${badge.required}`);
			await expect(item.getByRole('meter'), badge.name).toHaveAttribute(
				'aria-valuenow',
				String(badge.count)
			);
		}
	});

	test('filters by standing', async ({ page }) => {
		await gotoReady(page, '/badges');
		const earned = [...FROZEN, ...HIDDEN].filter((b) => b.earned);
		const unearned = [...FROZEN, ...HIDDEN].filter((b) => !b.earned);

		await filterByStanding(page, 'Earned');
		for (const badge of earned) await expect(card(page, badge.name), badge.name).toBeVisible();
		for (const badge of unearned) await expect(card(page, badge.name), badge.name).toHaveCount(0);

		await filterByStanding(page, 'Not earned');
		for (const badge of unearned) await expect(card(page, badge.name), badge.name).toBeVisible();
		for (const badge of earned) await expect(card(page, badge.name), badge.name).toHaveCount(0);

		// Combines with the search: nothing unearned is called this.
		await searchBox(page).fill(BADGES.thermo.name);
		await expect(page.getByText('No badges found', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
		await expect(standingTrigger(page)).toHaveAccessibleName('Filter by standing: All badges');
		await expect(card(page, BADGES.thermo.name)).toBeVisible();
		await expect(card(page, BADGES.field.name)).toBeVisible();
	});

	test("a holder finds a hidden badge by the rule they've unlocked", async ({ page }) => {
		await gotoReady(page, '/badges');
		await searchBox(page).fill('selected problems');
		await expect(card(page, BADGES.egg.name)).toBeVisible();
		// Not held, so still unsearchable.
		await searchBox(page).fill('100%');
		await expect(card(page, BADGES.secret.name)).toHaveCount(0);
	});

	test('a hidden requirement stays hidden until earned', async ({ page, apiAs }) => {
		const standing = await (await (await apiAs('badgeReader')).get('/progress/badges')).json();
		// Not earned: no count and no rule, so the page has nothing to leak.
		expect(standing[BADGES.secret.id]).toEqual({ count: null, earnedAt: null, revealed: null });
		// Earned: the rule comes with the standing, since /api/badges can't carry it.
		expect(standing[BADGES.egg.id]).toMatchObject({
			count: BADGES.egg.count,
			revealed: {
				summary: 'Complete 1 of the selected problems',
				requiredCount: 1,
				// Its list too, which /api/badges/[id] leaves out.
				problems: [
					{
						olympiadId: BADGE_OLYMPIAD.id,
						olympiadName: BADGE_OLYMPIAD.name,
						year: BADGE_OLYMPIAD.readerYear,
						number: 'P5',
						title: 'Badge Five'
					}
				]
			}
		});
		expect(standing[BADGES.egg.id].earnedAt).not.toBeNull();
		// A badge that was never hidden has nothing to reveal.
		expect(standing[BADGES.thermo.id].revealed).toBeNull();

		await gotoReady(page, '/badges');
		const secret = card(page, BADGES.secret.name);
		await expect(secret).toContainText('Requirement hidden');
		await expect(secret.getByRole('meter')).toHaveCount(0);
		await expect(secret).not.toContainText(`${BADGES.secret.count}/`);

		const egg = card(page, BADGES.egg.name);
		await expect(egg).toContainText('Earned ');
		await expect(egg).toContainText('Complete 1 of the selected problems');
		await expect(egg).not.toContainText('Requirement hidden');
	});
});

/*
 * `/badges/[id]`: one badge, with a manual badge's problems
 * (src/routes/(reg)/badges/[id]/). The list comes from the shared-cached
 * `/api/badges/[id]`, or from `/progress/badges` once the viewer holds a hidden
 * badge. `picked` lists P4 (done by the reader) and P6 (not); `egg` is hidden
 * and lists P5.
 */
test.describe("a badge's page", () => {
	/** The rows of the problem list. */
	const problems = (page: Page) => page.getByTestId('badge-problem');

	test.describe('signed out', () => {
		test('a card opens its page, which lists the selected problems', async ({ page }) => {
			await gotoReady(page, '/badges');
			await card(page, BADGES.picked.name).getByRole('link', { name: BADGES.picked.name }).click();
			await expect(page).toHaveURL(`/badges/${BADGES.picked.id}`);
			await expect(page.getByRole('heading', { level: 1, name: BADGES.picked.name })).toBeVisible();

			await expect(page.getByTestId('badge-requirement')).toContainText(
				'Complete 1 of the selected problems'
			);
			await expect(page.getByTestId('badge-requirement')).toContainText('Earned by 1 person');
			await expect(page.getByText('2 problems', { exact: true })).toBeVisible();
			await expect(problems(page)).toHaveText([/2024 · P4\s*Badge Four/, /2024 · P6\s*Badge Six/]);
			// Each opens its year on the olympiad page.
			await expect(problems(page).first().getByRole('link')).toHaveAttribute(
				'href',
				`/olympiads/${BADGE_OLYMPIAD.id}#${BADGE_OLYMPIAD.readerYear}`
			);
			// No standing, so nothing is ticked.
			await expect(page.getByText('Completed')).toHaveCount(0);
		});

		test('a filter badge has no list', async ({ page }) => {
			await gotoReady(page, `/badges/${BADGES.thermo.id}`);
			await expect(page.getByTestId('badge-requirement')).toContainText(
				'Complete 2 Badge Physics Olympiad Thermodynamics problems'
			);
			await expect(page.getByRole('heading', { name: 'The selected problems' })).toHaveCount(0);
		});

		test("a hidden badge's list stays hidden", async ({ page }) => {
			await gotoReady(page, `/badges/${BADGES.egg.id}`);
			await expect(page.getByTestId('badge-requirement')).toContainText('Requirement hidden');
			await expect(page.getByRole('heading', { name: 'The selected problems' })).toHaveCount(0);
			await expect(page.getByText('Badge Five')).toHaveCount(0);
		});

		test('an unknown badge is a 404', async ({ page }) => {
			for (const id of ['999999999', 'nope']) {
				const response = await page.goto(`/badges/${id}`);
				expect(response?.status(), id).toBe(404);
			}
		});
	});

	test.describe('signed in', () => {
		test.use({ role: 'badgeReader' });

		test('ticks the problems the viewer has done', async ({ page }) => {
			await gotoReady(page, `/badges/${BADGES.picked.id}`);
			await expect(page.getByTestId('badge-requirement')).toContainText('You earned this');
			await expect(page.getByText('1 of 2 problems done')).toBeVisible();
			await expect(problems(page).filter({ hasText: 'Badge Four' })).toContainText('Completed');
			await expect(problems(page).filter({ hasText: 'Badge Six' })).not.toContainText('Completed');
		});

		test("a hidden badge's list shows once the viewer holds it", async ({ page }) => {
			await gotoReady(page, `/badges/${BADGES.egg.id}`);
			await expect(page.getByTestId('badge-requirement')).toContainText(
				'Complete 1 of the selected problems'
			);
			await expect(problems(page)).toHaveText([/2024 · P5\s*Badge Five\s*Completed/]);
		});

		test('the dashboard links each earned badge to its page', async ({ page }) => {
			await gotoReady(page, '/');
			await page
				.getByRole('list', { name: 'Earned badges' })
				.getByRole('link', { name: BADGES.thermo.name })
				.click();
			await expect(page).toHaveURL(`/badges/${BADGES.thermo.id}`);
		});
	});
});
