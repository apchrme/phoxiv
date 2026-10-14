import type { Locator, Page } from '@playwright/test';
import { expect } from './test';

/*
 * UI helpers for things that are easy to get subtly wrong: waiting for
 * hydration, and bits-ui content that is portalled to the end of `<body>`
 * (dialogs, popovers, selects), so it must be found from `page`, never from
 * the trigger's container. See docs/testing.md, "Selectors".
 */

/**
 * Navigates and waits until the app has hydrated. Before hydration a click on
 * an enhanced form submits it natively (a full page load, no toast), and a
 * click on a bits-ui trigger does nothing. The root layout sets
 * `data-hydrated` on `<html>` in `onMount` for this.
 */
export async function gotoReady(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
}

/** The toast whose text contains `text`. svelte-sonner marks each with `data-sonner-toast`. */
export function toast(page: Page, text: string | RegExp): Locator {
	return page.locator('[data-sonner-toast]').filter({ hasText: text });
}

/**
 * Holds the page's POSTs to the form action `?/name` on `path` until the
 * returned function is called. A local action answers in milliseconds, too fast
 * to see the busy state its button shows meanwhile; holding keeps it on screen.
 */
export async function holdAction(page: Page, path: string, name: string): Promise<() => void> {
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route(
		(url) => url.pathname === path && url.search === `?/${name}`,
		async (route) => {
			await released;
			await route.continue();
		}
	);
	return release;
}

/** The open `ConfirmSubmit` dialog (an `alertdialog`, portalled). */
export function confirmDialog(page: Page): Locator {
	return page.getByRole('alertdialog');
}

/**
 * Opens an `OlympiadPicker` from its trigger and picks `names`, then waits for
 * the panel to close. The panel is portalled; its search box filters by name
 * and id. Names match exactly: "Delta Physics Olympiad" is a prefix of another
 * seeded name.
 *
 * One name is a single-mode pick: the picker closes itself. An array is a
 * multiple-mode pick: the panel stays open, so Escape closes it. Say which,
 * rather than checking whether the panel is still open: a single-mode panel is
 * still visible while it closes, and inside the ⌘K dialog that Escape reached
 * the dialog and closed it.
 */
export async function pickOlympiad(
	page: Page,
	trigger: Locator,
	names: string | string[]
): Promise<void> {
	await trigger.click();
	const search = page.getByPlaceholder('Search olympiads…');
	for (const name of typeof names === 'string' ? [names] : names) {
		await search.fill(name);
		await page.getByRole('option', { name, exact: true }).click();
	}
	if (typeof names !== 'string') await page.keyboard.press('Escape');
	await expect(search).toBeHidden();
}

/**
 * Opens the ⌘K dialog from the desktop nav button and returns it. The mobile
 * nav's button has the same name but is hidden at desktop width, so the role
 * query finds only the visible one.
 */
export async function openSearch(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: 'Search problems' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	return dialog;
}
