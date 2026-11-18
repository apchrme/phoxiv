import type { Locator } from '@playwright/test';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The olympiad page's search toolbar on a phone: below `md` the Topics,
 * Progress and Display triggers share a row under the input. Beside it, they
 * squeezed its placeholder to "Search by".
 *
 * Reads the frozen alpha olympiad as a signed-in user, so every trigger shows.
 * Writes nothing.
 */

test.use({ role: 'user', viewport: { width: 375, height: 667 } });

async function box(locator: Locator): Promise<{ x: number; y: number; width: number }> {
	const b = await locator.boundingBox();
	if (!b) throw new Error('the element has no box');
	return b;
}

test('the toolbar triggers take a full-width row under the search box', async ({ page }) => {
	await gotoReady(page, '/olympiads/alpha');
	const main = page.getByRole('main');
	// The whole pill, not the `<input>`: the search icon sits beside the input in it.
	const input = main.locator('[data-slot="input-group"]');
	const topics = main.getByRole('button', { name: 'Filter by topic', exact: true });
	const progress = main.getByRole('button', { name: /^Filter by progress/ });
	const display = main.getByRole('button', { name: /^Problems without files/ });
	await expect(progress).toBeVisible();

	const inputBox = await box(input);
	const topicsBox = await box(topics);
	const progressBox = await box(progress);
	const displayBox = await box(display);

	// Their own row, below the input, side by side.
	expect(topicsBox.y).toBeGreaterThan(inputBox.y);
	expect(progressBox.y).toBe(topicsBox.y);
	expect(displayBox.y).toBe(topicsBox.y);
	expect(progressBox.x).toBeGreaterThan(topicsBox.x);
	expect(displayBox.x).toBeGreaterThan(progressBox.x);

	// Together they span the search box's width, split evenly.
	const span = displayBox.x + displayBox.width - topicsBox.x;
	expect(span).toBeCloseTo(inputBox.width, -1);
	expect(topicsBox.width).toBeCloseTo(progressBox.width, 0);
	expect(displayBox.width).toBeCloseTo(progressBox.width, 0);
});
