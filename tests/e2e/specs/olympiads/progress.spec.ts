import type { APIRequestContext, Page, Response } from '@playwright/test';
import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';
import { gotoReady, toast } from '../../support/ui';

/*
 * Tracking progress on an olympiad page: marking a problem done, recording a
 * score, un-marking it, and refusing a bad score. The controls are
 * ProgressControl.svelte when signed in and SignInToTrack.svelte when signed
 * out, in src/routes/(reg)/olympiads/[olympiad]/.
 *
 * Owns USERS.tracker. Tracks the frozen alpha 2019 T1 (max 10) and T3 (max 7.5),
 * which writes only the tracker's own `problem_progress` rows, never alpha.
 */

const PAGE = '/olympiads/alpha';
const ACTION = `${PAGE}?/trackProblem`;
/** The signed-in user's progress in alpha. `private, no-store`, so it always reads D1. */
const PROGRESS = `${PAGE}/progress`;

/**
 * A problem's tracking control, found by the accessible name that states its
 * progress: "Mark problem T1 as done", "Problem T1 — done, no score recorded",
 * "Problem T3 — 5 out of 7.5".
 */
function control(page: Page, name: string) {
	return page.getByRole('button', { name, exact: true });
}

/** A button in the open tracking popover. Only one popover is open at a time. */
function popoverButton(page: Page, name: 'Save' | 'Mark done' | 'Remove') {
	return page.getByRole('button', { name, exact: true });
}

/** Reloads the page and waits for hydration, so the controls can be clicked again. */
async function reload(page: Page): Promise<void> {
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
}

/** The `?/trackProblem` POST that a popover submit sends. */
function isTrackPost(response: Response): boolean {
	return response.request().method() === 'POST' && response.url().endsWith('?/trackProblem');
}

/** The tracker's progress map, straight from the database. */
async function storedProgress(request: APIRequestContext): Promise<unknown> {
	const response = await request.get(PROGRESS);
	expect(response.status()).toBe(200);
	return response.json();
}

/** Tracks an alpha 2019 problem through the action, to arrange a test's starting state. */
async function track(
	request: APIRequestContext,
	number: string,
	intent: 'complete' | 'save' | 'remove',
	score = ''
): Promise<void> {
	await postAction(request, ACTION, { intent, year: '2019', number, score }, { success: true });
}

test.describe('tracking a problem', () => {
	test.use({ role: 'tracker' });

	test.beforeEach(async ({ request }) => {
		// Every test starts with nothing tracked, whatever an earlier one left
		// behind. Removing an untracked problem succeeds and changes nothing.
		await track(request, 'T1', 'remove');
		await track(request, 'T3', 'remove');
	});

	test('Mark done marks a problem, and it stays marked after a reload', async ({ page }) => {
		await gotoReady(page, PAGE);
		await control(page, 'Mark problem T1 as done').click();
		await popoverButton(page, 'Mark done').click();

		// No toast for a success (+page.svelte, "the icon changing is the
		// feedback"): the control and the year's running total are all there is.
		// formToasts' effect and the merge effect both run on the same `form`, so a
		// toast would render no later than the control changes.
		const done = control(page, 'Problem T1 — done, no score recorded');
		await expect(done).toBeVisible();
		await expect(page.locator('[data-sonner-toast]')).toHaveCount(0);
		await expect(page.getByText('1/3 done', { exact: true })).toBeVisible();

		await reload(page);
		await expect(done).toBeVisible();
		await expect(page.getByText('1/3 done', { exact: true })).toBeVisible();
	});

	test('a score shows against the maximum, and survives a reload', async ({ page, request }) => {
		await gotoReady(page, PAGE);
		await control(page, 'Mark problem T3 as done').click();
		const scoreBox = page.getByLabel('Score for T3, out of 7.5');
		// Three decimals, so the display rounds it and the box must not.
		await scoreBox.fill('5.125');
		// Enter saves: the Save button is "First in document order, so pressing
		// Enter in the box saves" (ProgressControl.svelte). With Mark done first,
		// Enter would mark it done and drop the score.
		await scoreBox.press('Enter');

		const scored = control(page, 'Problem T3 — 5.13 out of 7.5');
		await expect(scored).toHaveText('5.13/7.5');
		// The year's total: T3 is the only scored problem.
		await expect(page.getByText('5.13 / 7.5', { exact: true })).toBeVisible();
		expect(await storedProgress(request)).toEqual({ '2019:T3': { score: 5.125 } });

		await reload(page);
		await expect(scored).toHaveText('5.13/7.5');
		await expect(page.getByText('5.13 / 7.5', { exact: true })).toBeVisible();

		// The box holds the exact score, not the rounded one: "Use `exactScore`,
		// not `formatScore`: rounding here would change the score on the next
		// Save" (ProgressControl.svelte).
		await scored.click();
		await expect(scoreBox).toHaveValue('5.125');
	});

	test('a bad score is refused with its message and kept in the box, and does not block Mark done', async ({
		page,
		request
	}) => {
		await gotoReady(page, PAGE);
		const untracked = control(page, 'Mark problem T3 as done');
		await untracked.click();
		const scoreBox = page.getByLabel('Score for T3, out of 7.5');

		// "Rejected, not clamped. `actionFail`, not `error()`, keeps the popover's
		// input" (+page.server.ts). "abc" also guards the box's `type="text"`: as a
		// number input it would read as '' and "silently save "done, no score""
		// (ProgressControl.svelte), and `fill` would refuse to type it.
		const refusals = [
			{ score: '7.6', message: 'Score cannot be more than 7.5' },
			{ score: '-1', message: 'Score cannot be negative' },
			{ score: 'abc', message: '"abc" is not a number' }
		];
		for (const { score, message } of refusals) {
			await scoreBox.fill(score);
			const answered = page.waitForResponse(isTrackPost);
			await popoverButton(page, 'Save').click();

			// `actionFail(400, …)` answers HTTP 400, with the status in the body too.
			const response = await answered;
			expect(response.status(), score).toBe(400);
			expect(await response.json(), score).toMatchObject({ type: 'failure', status: 400 });
			await expect(toast(page, message)).toBeVisible();
			await expect(scoreBox).toHaveValue(score);
			await expect(untracked).toBeVisible();
		}

		expect(await storedProgress(request)).toEqual({});

		// With "abc" still in the box, Mark done goes through: "`complete` ignores
		// the score field, so a bad value can't block it" (+page.server.ts).
		await popoverButton(page, 'Mark done').click();
		await expect(control(page, 'Problem T3 — done, no score recorded')).toBeVisible();
		expect(await storedProgress(request)).toEqual({ '2019:T3': { score: null } });
	});

	test('Remove un-marks a problem, and it stays un-marked after a reload', async ({
		page,
		request
	}) => {
		// Arranged through the action: this test is about removing. T1 has a score,
		// so the box has something to empty; T3 is only there to be seen after the
		// reload (below).
		await track(request, 'T1', 'save', '6');
		await track(request, 'T3', 'complete');

		await gotoReady(page, PAGE);
		await expect(page.getByText('2/3 done', { exact: true })).toBeVisible();
		await control(page, 'Problem T1 — 6 out of 10').click();
		const scoreBox = page.getByLabel('Score for T1, out of 10');
		await expect(scoreBox).toHaveValue('6');
		await popoverButton(page, 'Remove').click();

		const untracked = control(page, 'Mark problem T1 as done');
		await expect(untracked).toBeVisible();
		// The popover now offers to mark it done, with the box re-seeded empty:
		// "a removal empties it" (ProgressControl.svelte).
		await expect(popoverButton(page, 'Mark done')).toBeVisible();
		await expect(scoreBox).toHaveValue('');
		await expect(page.getByText('1/3 done', { exact: true })).toBeVisible();
		expect(await storedProgress(request)).toEqual({ '2019:T3': { score: null } });

		await reload(page);
		// Every control reads "Mark problem … as done" until the progress fetch
		// lands, so wait for T3's before trusting T1's.
		await expect(control(page, 'Problem T3 — done, no score recorded')).toBeVisible();
		await expect(untracked).toBeVisible();
		await expect(page.getByText('1/3 done', { exact: true })).toBeVisible();
	});
});

test.describe('signed out', () => {
	test('a problem shows a sign-in hint instead of a tracking control', async ({ page }) => {
		await gotoReady(page, PAGE);
		const hint = page.getByRole('link', { name: 'Sign in to track problem T1', exact: true });
		await expect(hint).toBeVisible();
		await expect(page.getByRole('button', { name: /^Mark problem / })).toHaveCount(0);

		// The tooltip explains, and carries its own link: "This link is the only
		// route to /login on touch, where the trigger doesn't navigate"
		// (SignInToTrack.svelte).
		await hint.hover();
		const notice = page.getByText('Only signed-in users can track completed problems.');
		await expect(notice).toBeVisible();
		await expect(notice.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
			'href',
			'/login'
		);

		// With a mouse, the circle itself is the link to /login.
		await hint.click();
		await expect(page).toHaveURL(/\/login$/);
	});
});
