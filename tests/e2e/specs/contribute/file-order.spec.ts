import type { Locator, Page } from '@playwright/test';
import type { YearEntry } from '../../../../src/lib/types';
import { FILE_ORDER, USERS } from '../../fixtures/seed-data';
import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * Reordering files in the year editor: the move buttons on each file row, the
 * `moveFile` action behind them, and the order reaching the public API.
 *
 * Owns FILE_ORDER.olympiad, one year per test. Every seeded file there sits at
 * the default position 0, as files from before `position` do, so the starting
 * order is the `id` tiebreak and the first move must renumber them all.
 * Acts as the frozen USERS.admin.
 */

test.use({ role: 'admin' });

const { yearLevel, problem, forged } = FILE_ORDER.yearsByTest;
const [A, B, C] = FILE_ORDER.labels;

async function openFilesTab(page: Page, year: number): Promise<void> {
	await gotoReady(page, `/contribute/${FILE_ORDER.olympiad}/${year}`);
	await page.getByRole('tab', { name: 'Phase 2 — Files' }).click();
}

/** One owner's card, by its title (as in year-files.spec.ts). */
function card(page: Page, title: string): Locator {
	return page.locator('[data-slot="card"]').filter({ hasText: title });
}

/** A move button, named by FileSection.svelte's `sr-only` text. */
function move(section: Locator, label: string, direction: 'up' | 'down'): Locator {
	return section.getByRole('button', { name: `Move ${label} ${direction}`, exact: true });
}

/** The card's file labels in display order, read from the delete buttons' names. */
async function expectOrder(section: Locator, labels: readonly string[]): Promise<void> {
	await expect(section.getByRole('button', { name: /^Delete / })).toHaveText(
		labels.map((l) => `Delete ${l}`)
	);
}

/** Bypasses the shared cache, so the body is this run's data. */
async function publicOrder(page: Page, year: number): Promise<YearEntry> {
	const response = await page.request.get(`/api/olympiads/${FILE_ORDER.olympiad}`, {
		headers: { 'cache-control': 'no-cache' }
	});
	const years: YearEntry[] = await response.json();
	return years.find((y) => y.year === year)!;
}

test('year-level files move up and down, and the order is kept', async ({ page }) => {
	await openFilesTab(page, yearLevel);
	const year = card(page, 'Year-level files');
	await expectOrder(year, [A, B, C]);

	// Nowhere to go at either end.
	await expect(move(year, A, 'up')).toBeDisabled();
	await expect(move(year, C, 'down')).toBeDisabled();

	await move(year, B, 'up').click();
	await expectOrder(year, [B, A, C]);
	await move(year, B, 'down').click();
	await expectOrder(year, [A, B, C]);
	await move(year, B, 'down').click();
	await expectOrder(year, [A, C, B]);
	await expect(move(year, B, 'down')).toBeDisabled();

	// A reload reads the stored order, not the page's.
	await openFilesTab(page, yearLevel);
	await expectOrder(card(page, 'Year-level files'), [A, C, B]);

	// The public payload follows it.
	const entry = await publicOrder(page, yearLevel);
	expect(entry.yearFiles.map((f) => f.label)).toEqual([A, C, B]);
});

test('a problem’s files move within that problem', async ({ page }) => {
	await openFilesTab(page, problem);
	// A problem's card is titled with its number alone.
	const section = card(page, FILE_ORDER.problem);
	await expectOrder(section, ['Solution', 'Marking scheme']);

	await move(section, 'Marking scheme', 'up').click();
	await expectOrder(section, ['Marking scheme', 'Solution']);

	const entry = await publicOrder(page, problem);
	expect(entry.problems[0].files.map((f) => f.label)).toEqual(['Marking scheme', 'Solution']);
});

test('each file shows who uploaded it', async ({ page }) => {
	await openFilesTab(page, forged);
	const year = card(page, 'Year-level files');
	await expect(year.getByText(`Uploaded by ${USERS.contributor.name}`)).toHaveCount(1);
	// Seeded with no uploader, as a file from before attribution is.
	await expect(year.getByText('Uploader unknown')).toHaveCount(2);
});

test.describe('forged moves', () => {
	const path = `/contribute/${FILE_ORDER.olympiad}/${forged}?/moveFile`;

	test('an unknown file or direction is refused, and an edge move does nothing', async ({
		request
	}) => {
		await postAction(
			request,
			path,
			{ scope: 'year', label: 'No such file', direction: 'up' },
			{ failure: 404, message: 'File not found. Reload the page to see the latest files.' }
		);
		await postAction(
			request,
			path,
			{ scope: 'year', label: A, direction: 'sideways' },
			{ failure: 400, message: 'Direction must be up or down' }
		);
		await postAction(
			request,
			path,
			{ scope: 'problem', problemNumber: 'P9', label: A, direction: 'up' },
			{ failure: 404, message: 'Problem not found' }
		);
		// Already first: answered as a success, and nothing changes.
		await postAction(
			request,
			path,
			{ scope: 'year', label: A, direction: 'up' },
			{ success: true }
		);
	});

	test('a contributor not assigned the olympiad is refused', async ({ apiAs }) => {
		await postAction(
			await apiAs('contributor'),
			path,
			{ scope: 'year', label: A, direction: 'down' },
			{ error: 403, message: 'Unauthorised' }
		);
	});
});
