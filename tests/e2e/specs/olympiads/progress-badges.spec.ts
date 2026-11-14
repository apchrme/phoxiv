import type { APIRequestContext } from '@playwright/test';
import type { BadgeProgressMap } from '../../../../src/lib/badges';
import { BADGE_OLYMPIAD, BADGES } from '../../fixtures/seed-data';
import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';
import { gotoReady, showProblemsWithoutFiles, toast } from '../../support/ui';

/*
 * Tracking a problem re-evaluates the user's badges: the last qualifying
 * completion awards a badge with a toast, and un-marking one takes it away
 * (badges are revocable; docs/data-model.md).
 *
 * Owns USERS.badgeTracker and BADGES.tracker, a manual badge over the badge
 * olympiad's 2025 problems Q1 and Q2. Those match no other badge, so nothing
 * else is earned along the way.
 */

const PAGE = `/olympiads/${BADGE_OLYMPIAD.id}`;
const ACTION = `${PAGE}?/trackProblem`;
const YEAR = String(BADGE_OLYMPIAD.trackerYear);

async function track(request: APIRequestContext, number: string, intent: 'complete' | 'remove') {
	return postAction(request, ACTION, { intent, year: YEAR, number }, { success: true });
}

/** The tracker's standing on its badge, straight from the database. */
async function standing(request: APIRequestContext) {
	const response = await request.get('/progress/badges');
	expect(response.status()).toBe(200);
	return ((await response.json()) as BadgeProgressMap)[BADGES.tracker.id];
}

/** The badge's holder count, past the shared cache. */
async function holders(request: APIRequestContext): Promise<number> {
	const response = await request.get('/api/badges', { headers: { 'cache-control': 'no-cache' } });
	const body: { id: number; holders: number }[] = await response.json();
	return body.find((b) => b.id === BADGES.tracker.id)!.holders;
}

test.describe('earning and losing a badge', () => {
	test.use({ role: 'badgeTracker' });

	test.beforeEach(async ({ request }) => {
		await track(request, 'Q1', 'remove');
		await track(request, 'Q2', 'remove');
	});

	test('the last qualifying problem unlocks it with a toast', async ({ page, request }) => {
		// One of two: progress, no award, and no badge in the action's answer.
		const first = await track(request, 'Q1', 'complete');
		expect(first.data?.badgesEarned).toEqual([]);
		expect(await standing(request)).toEqual({ count: 1, earnedAt: null, revealed: null });

		await gotoReady(page, PAGE);
		// Q2 has no files, so its control is in the collapsed section.
		await showProblemsWithoutFiles(page, BADGE_OLYMPIAD.trackerYear);
		await page.getByRole('button', { name: 'Mark problem Q2 as done', exact: true }).click();
		await page.getByRole('button', { name: 'Mark done', exact: true }).click();
		await expect(toast(page, `Badge unlocked: ${BADGES.tracker.name}`)).toBeVisible();

		const after = await standing(request);
		expect(after.count).toBe(2);
		expect(after.earnedAt).not.toBeNull();
		expect(await holders(request)).toBe(1);

		// Already held: tracking again (a re-save) awards nothing new.
		const again = await track(request, 'Q2', 'complete');
		expect(again.data?.badgesEarned).toEqual([]);
	});

	test('un-marking a problem takes the badge away', async ({ request }) => {
		await track(request, 'Q1', 'complete');
		const earned = await track(request, 'Q2', 'complete');
		expect(earned.data?.badgesEarned).toEqual([BADGES.tracker.name]);
		expect(await holders(request)).toBe(1);

		await track(request, 'Q2', 'remove');
		expect(await standing(request)).toEqual({ count: 1, earnedAt: null, revealed: null });
		expect(await holders(request)).toBe(0);
	});
});
