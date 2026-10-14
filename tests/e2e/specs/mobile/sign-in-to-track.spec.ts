import type { Locator } from '@playwright/test';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * SignInToTrack.svelte on a touch screen, signed out. With a mouse the circle
 * is a link to /login (specs/olympiads/progress); on touch a tap must show the
 * notice instead, because bits-ui never opens a tooltip from touch and a phone
 * has no hover, so the notice would otherwise never be seen.
 *
 * Reads the frozen alpha olympiad. Writes nothing.
 */

const PAGE = '/olympiads/alpha';
const NOTICE = 'Only signed-in users can track completed problems.';

/**
 * Taps the hint once its last press has settled. The button eases back from
 * `active:translate-y-px` (`transition-all`), and while it moves, Playwright
 * finds it unstable and retries the tap, scrolling the page to a new position
 * each time. bits-ui closes an open tooltip on scroll, so under load the retry
 * closed the notice the last tap had opened, and this tap then opened it again.
 */
async function tapWhenStill(hint: Locator): Promise<void> {
	await expect(hint).toHaveCSS('translate', 'none');
	await hint.tap();
}

test.describe('the sign-in hint on touch', () => {
	test('a tap shows the notice instead of navigating, and its link goes to /login', async ({
		page
	}) => {
		await gotoReady(page, PAGE);
		// Every navigation from here on, client-side ones included. Not requests:
		// `data-sveltekit-preload-data="hover"` (app.html) fetches /login's data on
		// touchstart, even for a tap that then doesn't navigate.
		const navigations: string[] = [];
		page.on('framenavigated', (frame) => {
			if (frame === page.mainFrame()) navigations.push(frame.url());
		});
		const hint = page.getByRole('link', { name: 'Sign in to track problem T1', exact: true });
		const notice = page.getByText(NOTICE);
		await expect(notice).toBeHidden();

		// "A touch tap suppresses the link, or the notice is never seen on a phone"
		// (SignInToTrack.svelte). The same click handler's `preventDefault` also
		// stops SvelteKit's router, which skips a prevented click.
		await tapWhenStill(hint);
		await expect(notice).toBeVisible();
		await expect(page).toHaveURL(PAGE);
		expect(navigations).toEqual([]);

		// "Toggle on click, not pointerdown, or the dismiss layer closes it at once",
		// and "Toggle from the state before the tap: Android focuses on tap, and
		// focus opens the tooltip first" (SignInToTrack.svelte). Get either wrong and
		// a second tap leaves it open, or the first never opens it.
		await tapWhenStill(hint);
		await expect(notice).toBeHidden();
		await tapWhenStill(hint);
		await expect(notice).toBeVisible();
		await expect(page).toHaveURL(PAGE);
		expect(navigations).toEqual([]);

		// "This link is the only route to /login on touch, where the trigger doesn't
		// navigate" (SignInToTrack.svelte).
		await notice.getByRole('link', { name: 'Sign in', exact: true }).tap();
		await expect(page).toHaveURL(/\/login$/);
		// Positive control: the listener sees SvelteKit's client-side navigations, so
		// the empty lists above mean the taps went nowhere.
		expect(navigations.map((url) => new URL(url).pathname)).toContain('/login');
	});
});
