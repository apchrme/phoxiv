import type { Locator } from '@playwright/test';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The olympiad page's search toolbar on a phone. The captioned Topics and
 * Progress triggers sit in SearchBar's `filters`, so below `md` they leave the
 * input its own row and share the row beneath it, filling its width. Beside
 * the input they squeezed its placeholder to "Search by".
 *
 * Reads the frozen alpha olympiad as a signed-in user, so both filters show.
 * Writes nothing.
 */

test.use({ role: 'user', viewport: { width: 375, height: 667 } });

async function box(locator: Locator): Promise<{ x: number; y: number; width: number }> {
	const b = await locator.boundingBox();
	if (!b) throw new Error('the element has no box');
	return b;
}

test('the filters take a full-width row under the search box', async ({ page }) => {
	await gotoReady(page, '/olympiads/alpha');
	const main = page.getByRole('main');
	// The whole pill, not the `<input>`: the search icon sits beside the input in it.
	const input = main.locator('[data-slot="input-group"]');
	const topics = main.getByRole('button', { name: 'Filter by topic', exact: true });
	const progress = main.getByRole('button', { name: /^Filter by progress/ });
	await expect(progress).toBeVisible();

	const inputBox = await box(input);
	const topicsBox = await box(topics);
	const progressBox = await box(progress);

	// Their own row, below the input, side by side.
	expect(topicsBox.y).toBeGreaterThan(inputBox.y);
	expect(progressBox.y).toBe(topicsBox.y);
	expect(progressBox.x).toBeGreaterThan(topicsBox.x);

	// Together they span the search box's width, split evenly.
	const span = progressBox.x + progressBox.width - topicsBox.x;
	expect(span).toBeCloseTo(inputBox.width, -1);
	expect(topicsBox.width).toBeCloseTo(progressBox.width, 0);
});
