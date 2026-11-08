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
