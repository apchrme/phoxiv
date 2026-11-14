import type { Locator, Page } from '@playwright/test';
import { PROBLEM_TOPICS, type YearEntry } from '../../../../src/lib/types';
import { XSS_TITLE } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, showProblemsWithoutFiles, withoutFilesToggle } from '../../support/ui';

/*
 * The public olympiad page, src/routes/(reg)/olympiads/[olympiad]/: what it must
 * never render from the data it is given.
 *
 * Reads only frozen rows: `alpha` and its years 2019 and 2020. Writes nothing.
 */

/**
 * A year's panel. YearPanel.svelte gives it the year as its `id`, "the target for
 * `#2019`-style links from search", so the hook is already kept stable.
 */
function yearPanel(page: Page, year: number): Locator {
	return page.locator(`[id="${year}"]`);
}

test('an unknown olympiad is a 404 page', async ({ page }) => {
	const response = await page.goto('/olympiads/nope');
	expect(response?.status()).toBe(404);
	// `OLYMPIAD_NOT_FOUND`, from requireOlympiad in
	// src/lib/server/db/queries/olympiads.ts. Copied: that module imports through
	// `#lib`, which doesn't resolve here.
	await expect(page.getByRole('heading', { name: 'Error 404: Olympiad not found' })).toBeVisible();
});

test.describe('topics', () => {
	// "Topics aren't rendered here, to keep the card uncluttered" (ProblemCard.svelte).
	// The topic filter's menu lists every topic by name, so the check is scoped to
	// the year panels, which hold the problem cards, never the page as a whole.

	test('travel to the page for its filter', async ({ request }) => {
		// Without this, the test below would pass on a payload that had lost them.
		const years: YearEntry[] = await (await request.get('/api/olympiads/alpha')).json();
		const topics = years.flatMap((y) => y.problems.flatMap((p) => p.topics ?? []));
		expect(new Set(topics)).toEqual(
			new Set(['Mechanics', 'Electromagnetism', 'Relativity', 'Modern', 'Thermodynamics'])
		);
	});

	// Signed in, each card carries ProgressControl instead of SignInToTrack.
	for (const role of [null, 'user'] as const) {
		test(`are never shown on a problem (${role ?? 'signed out'})`, async ({ as }) => {
			const page = await as(role);
			await gotoReady(page, '/olympiads/alpha');
			// The rows too, not only the cards: Heat Engine has no files.
			await showProblemsWithoutFiles(page, 2019);
			await showProblemsWithoutFiles(page, 2020);

			// A title in each panel first: the problems come from a fetch after
			// hydration, and an empty panel would pass the checks below.
			const panels = [
				{ panel: yearPanel(page, 2019), title: 'Rolling Cylinder' },
				{ panel: yearPanel(page, 2020), title: 'Heat Engine' }
			];
			for (const { panel, title } of panels) {
				await expect(panel.getByText(title, { exact: true })).toBeVisible();
				for (const topic of PROBLEM_TOPICS) await expect(panel).not.toContainText(topic);
			}
		});
	}
});

test.describe('problems without files', () => {
	// Alpha 2019: T1 has a file; T2 and T3 don't. 2020: neither problem has one.

	test('are one-line rows in a section that starts collapsed', async ({ page }) => {
		await gotoReady(page, '/olympiads/alpha');
		const y2019 = yearPanel(page, 2019);

		// T1 keeps its card, with its file.
		await expect(y2019.getByText('Rolling Cylinder', { exact: true })).toBeVisible();
		await expect(y2019.getByRole('link', { name: 'Solution' })).toBeVisible();

		const toggle = withoutFilesToggle(page, 2019);
		await expect(toggle).toHaveText('2 problems without files');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(y2019.getByText('Fast Rocket', { exact: true })).toBeHidden();
		// A year with no files at all is only the toggle.
		await expect(withoutFilesToggle(page, 2020)).toHaveAttribute('aria-expanded', 'false');
		await expect(yearPanel(page, 2020).getByText('Heat Engine', { exact: true })).toBeHidden();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		// One row each, holding the number, the title and the tracking control.
		const rows = y2019.getByRole('listitem');
		await expect(rows).toHaveCount(2);
		const t3 = rows.filter({ hasText: 'Fast Rocket' });
		await expect(t3).toContainText('T3');
		await expect(
			t3.getByRole('link', { name: 'Sign in to track problem T3', exact: true })
		).toBeVisible();

		await toggle.click();
		await expect(y2019.getByText('Fast Rocket', { exact: true })).toBeHidden();
	});

	test('a query opens them, and clearing it closes them again', async ({ page }) => {
		// "a match hidden behind a collapsed toggle would look like no match at
		// all" (filter.ts, isNarrowed).
		await gotoReady(page, '/olympiads/alpha');
		const toggle = withoutFilesToggle(page, 2019);
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');

		const query = page.getByPlaceholder('Search by year or problem…');
		await query.fill('rocket');
		await expect(toggle).toHaveText('1 problem without files');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(yearPanel(page, 2019).getByText('Fast Rocket', { exact: true })).toBeVisible();

		await query.fill('');
		await expect(toggle).toHaveText('2 problems without files');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	});

	test('the year a link points at opens them', async ({ page }) => {
		// "⌘K, the dashboard and badge pages all link to the year, and the problem
		// they mean may be in this section" (YearPanel.svelte).
		await gotoReady(page, '/olympiads/alpha#2020');
		await expect(withoutFilesToggle(page, 2020)).toHaveAttribute('aria-expanded', 'true');
		await expect(yearPanel(page, 2020).getByText('Heat Engine', { exact: true })).toBeVisible();
		await expect(withoutFilesToggle(page, 2019)).toHaveAttribute('aria-expanded', 'false');
	});
});

test('a stored javascript: link is not rendered as a link', async ({ page }) => {
	// Alpha 2019's "Evil link" predates saveMetadata's check. "This drops any
	// stored before it did, since a `javascript:` href here would run for whoever
	// clicks it" (YearPanel.svelte).
	await gotoReady(page, '/olympiads/alpha');
	const year = yearPanel(page, 2019);

	// The links are filtered together, so the safe one being there proves the
	// filter has run and the checks below aren't passing on an empty panel.
	await expect(year.getByRole('link', { name: 'Official site' })).toHaveAttribute(
		'href',
		'https://example.org/alpha-2019'
	);
	await expect(page.getByRole('link', { name: 'Evil link' })).toHaveCount(0);
	// Under any name: the href is the danger, not the label.
	await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test('an XSS problem title renders as literal text', async ({ page }) => {
	await gotoReady(page, '/olympiads/alpha');
	// T2 has no files, so it is a row in the collapsed section.
	await showProblemsWithoutFiles(page, 2019);
	await expect(yearPanel(page, 2019).getByText(XSS_TITLE, { exact: true })).toBeVisible();
	// Parsed as markup, the title would be an `<img>`, whose `onerror` runs once
	// `x` fails to load. The element would exist as soon as the card rendered.
	await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
