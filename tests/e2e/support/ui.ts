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

/** The open `ConfirmSubmit` dialog (an `alertdialog`, portalled). */
export function confirmDialog(page: Page): Locator {
	return page.getByRole('alertdialog');
}

/**
 * Opens an `OlympiadPicker` from its trigger and picks `name`. The panel is
 * portalled; its search box filters by name and id.
 */
export async function pickOlympiad(page: Page, trigger: Locator, name: string): Promise<void> {
	await trigger.click();
	await page.getByPlaceholder('Search olympiads…').fill(name);
	await page.getByRole('option', { name }).click();
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
