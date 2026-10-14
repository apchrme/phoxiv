import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The ⌘K dialog on a phone (src/lib/components/search/GlobalSearch.svelte): at
 * the narrowest widths it must still fit its rows, with no control pushed out
 * of the viewport or clipped by the dialog's `overflow-hidden`, and its popups
 * must stay on screen. Real phones are still checked by hand (docs/contributing.md,
 * "The gates").
 *
 * `toBeInViewport({ ratio: 1 })` is the check throughout: it measures with an
 * IntersectionObserver, which clips by every `overflow` ancestor on the way to
 * the viewport, so a control the dialog cuts off fails it as surely as one past
 * the screen's edge.
 *
 * Reads frozen seed rows only. Writes nothing.
 */

/** Any page will do: the dialog is mounted by the root layout. */
const START = '/privacy';

/**
 * Opens the dialog from the mobile nav's search button, by tap. The desktop
 * nav's button has the same name but is hidden below `md`.
 */
async function openSearchByTap(page: Page): Promise<Locator> {
	await gotoReady(page, START);
	await page.getByRole('button', { name: 'Search problems' }).tap();
	const dialog = page.getByRole('dialog', { name: 'Search problems' });
	await expect(dialog).toBeVisible();
	return dialog;
}

/** Each of `controls` lies wholly on screen, uncut by the dialog. */
async function expectAllOnScreen(controls: Locator[]): Promise<void> {
	for (const control of controls) await expect(control).toBeInViewport({ ratio: 1 });
}

/**
 * The close button is the hit target at its own centre, so nothing is drawn
 * over it, and a tap on it closes the dialog.
 */
async function expectCloseWorks(page: Page, dialog: Locator): Promise<void> {
	const close = dialog.getByRole('button', { name: 'Close search' });
	await expect(close).toBeInViewport({ ratio: 1 });
	await expect
		.poll(() =>
			close.evaluate((button) => {
				const { x, y, width, height } = button.getBoundingClientRect();
				const hit = document.elementFromPoint(x + width / 2, y + height / 2);
				return hit !== null && button.contains(hit);
			})
		)
		.toBe(true);
	await close.tap();
	await expect(dialog).toBeHidden();
}

/**
 * The input's rendered width. "Keep `min-w-0` on the input: without it the input
 * won't shrink below ~20 characters and the row overflows (and is clipped)"
 * (GlobalSearch.svelte). An input too wide shows as a clipped filter, which the
 * on-screen checks catch; this checks the other way the row could be wrong, the
 * input squeezed to nothing.
 */
async function inputWidth(box: Locator): Promise<number> {
	return (await box.boundingBox())?.width ?? 0;
}

/** The right edge of `locator`'s box, in viewport pixels. */
async function rightEdge(locator: Locator): Promise<number> {
	const box = await locator.boundingBox();
	if (!box) throw new Error('the element has no box');
	return box.x + box.width;
}

test.describe('⌘K at 375px, signed in, with a topic filter', () => {
	test.use({ role: 'user', viewport: { width: 375, height: 667 } });

	test('every control fits on screen, and the close button is not clipped', async ({ page }) => {
		const dialog = await openSearchByTap(page);
		await expect(dialog).toBeInViewport({ ratio: 1 });

		// The topic menu opens inside the screen too: it is aligned to the
		// trigger's end, which sits near the right edge.
		const topic = dialog.getByRole('button', { name: 'Filter by topic' });
		await topic.tap();
		const menu = page.getByRole('menu');
		await expect(menu).toBeInViewport({ ratio: 1 });
		await page.getByRole('checkbox', { name: 'Mechanics' }).check();
		// Escape closes the innermost layer only: the menu, not the dialog.
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();
		await expect(topic).toHaveAttribute('title', 'Mechanics');

		// The filter lists the matching pool with an empty query, under a summary
		// bar whose "Clear filters" is one more control on the row.
		await expect(dialog.locator('[data-result-index]').first()).toBeVisible();
		const box = dialog.getByRole('searchbox');
		await expectAllOnScreen([
			dialog.getByRole('tab', { name: 'Problems' }),
			dialog.getByRole('tab', { name: 'Files' }),
			box,
			topic,
			// Signed in, so the progress filter is on the row as well.
			dialog.getByRole('button', { name: 'Filter by progress: All problems' }),
			dialog.getByRole('button', { name: 'Clear filters' })
		]);
		await expect.poll(() => inputWidth(box)).toBeGreaterThan(120);

		await expectCloseWorks(page, dialog);
	});
});

test.describe('⌘K at 390px, files mode', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('the controls and the input fit, and the olympiad panel stays on screen', async ({
		page
	}) => {
		await openSearchByTap(page);
		await page.getByRole('tab', { name: 'Files' }).tap();
		// The title follows the mode, so this also proves the switch happened.
		const dialog = page.getByRole('dialog', { name: 'Search inside files' });
		await expect(dialog).toBeVisible();

		// "Absent until `/api/olympiads` lands" (GlobalSearch.svelte), so waiting for
		// it also waits for the list.
		const olympiad = dialog.getByRole('button', { name: 'Filter by olympiad: All olympiads' });
		await expect(olympiad).toBeVisible();
		const box = dialog.getByRole('searchbox');
		await expectAllOnScreen([
			dialog.getByRole('tab', { name: 'Problems' }),
			dialog.getByRole('tab', { name: 'Files' }),
			olympiad,
			box
		]);
		await expect.poll(() => inputWidth(box)).toBeGreaterThan(120);

		// The panel is "Portalled because the ⌘K dialog is `overflow-hidden` and would
		// clip it" (OlympiadPicker.svelte), anchored to the trigger's end
		// (`align="end"`), so it opens leftwards from a trigger near the right edge.
		// (Its `max-w-[calc(100vw-2rem)]` cap only binds below about 320px, so this
		// width doesn't test it.) It has no role of its own; `data-popover-content` is
		// bits-ui's hook on it.
		await olympiad.tap();
		const panel = page.locator('[data-popover-content]');
		const panelSearch = page.getByPlaceholder('Search olympiads…');
		await expect(panelSearch).toBeVisible();
		await expect(panel).toBeInViewport({ ratio: 1 });
		await expect(page.getByRole('option', { name: 'All olympiads' })).toBeInViewport({ ratio: 1 });
		// Its right edge meets the trigger's. On screen alone can't tell `end` from
		// `start`: bits-ui shifts a panel that would overflow back inside the screen.
		await expect
			.poll(async () => Math.abs((await rightEdge(panel)) - (await rightEdge(olympiad))))
			.toBeLessThanOrEqual(1);

		// A pick by tap closes the panel and fills the trigger, still on screen.
		await panelSearch.fill('Alpha Physics Olympiad');
		await page.getByRole('option', { name: 'Alpha Physics Olympiad', exact: true }).tap();
		await expect(panel).toBeHidden();
		const picked = dialog.getByRole('button', {
			name: 'Filter by olympiad: Alpha Physics Olympiad'
		});
		await expect(picked).toBeInViewport({ ratio: 1 });

		await expectCloseWorks(page, dialog);
	});
});
