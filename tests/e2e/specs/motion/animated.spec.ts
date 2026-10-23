import type { Locator } from '@playwright/test';
import { CORPUS } from '../../../../src/routes/corpus';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The animated paths, which every other project skips by reducing motion: the
 * landing page's GSAP reveals and drifting corpus band (src/routes/+page.svelte,
 * CorpusBand.svelte), and the ⌘K dialog's open and close animations
 * (GlobalSearch.svelte). The `test` fixture fails a test on any uncaught page
 * error, so a tween that throws fails here too.
 *
 * Reads the frozen delta olympiad's 2020 problem (Delta Lens) for the ⌘K test.
 * The corpus tiles link olympiads the seed doesn't have.
 * Writes nothing.
 */

/**
 * A tile from the middle of the band's first row, which drifts left at 26px/s.
 * At 1280px its centre starts near x=856, so it stays on screen for about half a
 * minute; the row's first tile left the screen about three seconds in, which a
 * slow run could outlast.
 */
const TILE = CORPUS[4];

/** Where `locator` is right now, wherever its drift has taken it. */
async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
	const box = await locator.boundingBox();
	if (!box) throw new Error('the element has no box');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('with animations on', () => {
	test('the landing page reveals its sections, and a drifting tile can be clicked', async ({
		page
	}) => {
		await gotoReady(page, '/');

		// "Hide synchronously so nothing flashes before the reveal" (+page.svelte):
		// the hero starts hidden and the timeline brings it back.
		await expect(page.getByRole('heading', { name: 'Every olympiad, one place.' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'Browse olympiads' })).toBeVisible();

		// The band is hidden until scrolled to ("Scroll reveals", +page.svelte). A
		// hidden element can't be scrolled to by a click, so scroll as a reader would.
		// The pointer stays at the top, over the sticky nav, clear of the band.
		const lede = page.getByRole('heading', { name: 'Pick any problem.' });
		await expect(lede).toBeHidden();
		await page.mouse.move(640, 30);
		await page.mouse.wheel(0, 600);
		await expect(lede).toBeVisible();

		// Clones are `aria-hidden`, so the role query finds only the original tile.
		const tile = page.getByRole('link', { name: new RegExp(`${TILE.label}.*${TILE.year}`) });
		await expect(tile).toBeVisible();
		const left = async () => (await tile.boundingBox())?.x;
		const before = await left();
		await expect.poll(left, { message: 'the band drifts' }).not.toBe(before);

		// "Hover pauses the drift" (CorpusBand.svelte). A raw pointer move, because a
		// locator's hover would wait for the tile to stand still first. Then the
		// click's own wait for a stable tile passes only if the drift has stopped.
		const { x, y } = await centreOf(tile);
		await page.mouse.move(x, y);
		await tile.click();
		await expect(page).toHaveURL(`/olympiads/${TILE.olympiad}#${TILE.year}`);
	});

	test('the ⌘K dialog opens, closes and reopens through its animations', async ({ page }) => {
		await gotoReady(page, '/');
		const open = page.getByRole('button', { name: 'Search problems' });
		const dialog = page.getByRole('dialog', { name: 'Search problems' });
		const box = dialog.getByRole('searchbox');

		await open.click();
		await expect(dialog).toBeVisible();
		await expect(box).toBeFocused();
		await box.fill('delta lens');
		await expect(dialog.locator('[data-result-index]').first()).toContainText('Delta Lens');

		// bits-ui keeps the content mounted until its exit animation ends; it must
		// still end and unmount.
		await dialog.getByRole('button', { name: 'Close search' }).click();
		await expect(dialog).toBeHidden();

		// Reopened, it is reset and usable again; Escape closes it the same way.
		await open.click();
		await expect(dialog).toBeVisible();
		await expect(box).toHaveValue('');
		await box.press('Escape');
		await expect(dialog).toBeHidden();

		// A result opened by Enter closes the dialog and navigates.
		await open.click();
		await box.fill('delta lens');
		await expect(dialog.locator('[data-result-index]').first()).toContainText('Delta Lens');
		await box.press('Enter');
		await expect(page).toHaveURL('/olympiads/delta#2020');
		await expect(dialog).toBeHidden();
	});
});
