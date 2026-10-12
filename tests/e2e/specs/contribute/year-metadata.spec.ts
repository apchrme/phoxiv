import type { Locator, Page } from '@playwright/test';
import { OWNED, OWNED_FILE_URLS } from '../../fixtures/seed-data';
import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';
import { gotoReady, toast } from '../../support/ui';

/*
 * The year editor's metadata tab (`/contribute/<olympiad>/<year>`, "Phase 1"):
 * notes, links and problems, saved together by `?/saveMetadata`.
 *
 * Owns OWNED.metaOlympiad, one year per test (OWNED.metaYears), so no two tests
 * write the same rows. Acts as the frozen USERS.admin, who may edit any olympiad.
 *
 * The draft is seeded once from the load and survives a save, so the editor on
 * screen after a save shows what was typed, not what was stored. Every check of
 * what the server kept reloads the page first.
 */

test.use({ role: 'admin' });

const YEARS = OWNED.metaYears;

function editorPath(year: number): string {
	return `/contribute/${OWNED.metaOlympiad}/${year}`;
}

/** Row `n`'s inputs (1-based), by the aria-labels ProblemsEditor.svelte gives them. */
function problemRow(page: Page, n: number) {
	return {
		number: page.getByLabel(`Problem ${n} number`, { exact: true }),
		title: page.getByLabel(`Problem ${n} title`, { exact: true }),
		maxScore: page.getByLabel(`Problem ${n} maximum score`, { exact: true })
	};
}

/** Expects row `n` to hold exactly these values. A blank max score is `''`. */
async function expectProblem(
	page: Page,
	n: number,
	expected: { number: string; title: string; maxScore: string }
): Promise<void> {
	const row = problemRow(page, n);
	await expect(row.number).toHaveValue(expected.number);
	await expect(row.title).toHaveValue(expected.title);
	await expect(row.maxScore).toHaveValue(expected.maxScore);
}

/**
 * Expects problem `number` to have exactly `topics`. The trigger is found by its
 * summary (TopicSelect.svelte: "Topics", the one topic, or "2 topics"), and the
 * menu's heading names the problem it belongs to, which ties the topics to the
 * row rather than to a position.
 */
async function expectTopics(page: Page, number: string, topics: string[]): Promise<void> {
	const summary =
		topics.length === 0 ? 'Topics' : topics.length === 1 ? topics[0] : `${topics.length} topics`;
	await page.getByRole('button', { name: summary, exact: true }).click();
	// Portalled to the end of <body>, so found from the page.
	const menu = page.getByRole('menu');
	await expect(menu.getByText(`Topics for ${number}`, { exact: true })).toBeVisible();
	for (const topic of topics) {
		await expect(menu.getByRole('checkbox', { name: topic, exact: true })).toBeChecked();
	}
	await expect(menu.getByRole('checkbox', { checked: true })).toHaveCount(topics.length);
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
}

/** The files tab's card for one problem, found by the title in its heading. */
function problemFilesCard(page: Page, title: string): Locator {
	// Cards have no role; `data-slot` is the vendored Card's own hook.
	return page.locator('[data-slot="card"]').filter({ hasText: title });
}

async function saveMetadata(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Save metadata' }).click();
	await expect(toast(page, 'Metadata saved')).toBeVisible();
}

test.describe('the year editor, metadata tab', () => {
	test('removing a middle problem leaves the others their own data and files', async ({ page }) => {
		// saveMetadata zips the problem fields back together by position, so every
		// row must render one input per field: metadata.ts, "An input behind an
		// `{#if}` silently shifts later rows' data into the wrong record". Every
		// field of the three seeded rows differs, so a shift can't go unnoticed, and
		// T1's maximum is blank ahead of T3's, so an input shown only while its field
		// is set would hand T3's maximum to T1.
		await gotoReady(page, editorPath(YEARS.rowShift));
		await expectProblem(page, 1, { number: 'T1', title: 'First Problem', maxScore: '' });
		await expectProblem(page, 2, { number: 'T2', title: 'Second Problem', maxScore: '20' });
		await expectProblem(page, 3, { number: 'T3', title: 'Third Problem', maxScore: '30' });

		// Every row's button has the same name; the second is T2's.
		await page.getByRole('button', { name: 'Remove problem' }).nth(1).click();
		await expectProblem(page, 2, { number: 'T3', title: 'Third Problem', maxScore: '30' });
		await expect(problemRow(page, 3).number).toHaveCount(0);

		await saveMetadata(page);

		await gotoReady(page, editorPath(YEARS.rowShift));
		await expectProblem(page, 1, { number: 'T1', title: 'First Problem', maxScore: '' });
		await expectProblem(page, 2, { number: 'T3', title: 'Third Problem', maxScore: '30' });
		await expect(problemRow(page, 3).number).toHaveCount(0);
		await expectTopics(page, 'T1', ['Mechanics']);
		await expectTopics(page, 'T3', ['Relativity']);

		// Files hang off the problem rows and go with them on delete, so a save that
		// removed the wrong row would take T1's or T3's file with it.
		await page.getByRole('tab', { name: 'Phase 2 — Files' }).click();
		for (const [title, url] of [
			['First Problem', OWNED_FILE_URLS.rowShiftT1],
			['Third Problem', OWNED_FILE_URLS.rowShiftT3]
		]) {
			const card = problemFilesCard(page, title);
			await expect(card.getByRole('button', { name: 'Delete Solution' })).toBeVisible();
			await expect(card.getByRole('link', { name: 'View' })).toHaveAttribute('href', url);
		}
		await expect(page.getByText('Second Problem')).toHaveCount(0);
	});

	test("saving keeps every problem's topics", async ({ page }) => {
		// TopicSelect's menu is portalled out of the form, so a hidden input carries
		// each row's topics: ProblemsEditor.svelte, "Removing it clears every
		// problem's topics on save". Saved unchanged, nothing may change.
		await gotoReady(page, editorPath(YEARS.topics));
		await expectTopics(page, 'T1', ['Waves and Optics', 'Modern']);
		await expectTopics(page, 'T2', []);

		await saveMetadata(page);

		await gotoReady(page, editorPath(YEARS.topics));
		await expectTopics(page, 'T1', ['Waves and Optics', 'Modern']);
		await expectTopics(page, 'T2', []);
	});

	test('a duplicate problem number is blocked in the browser and refused by the server', async ({
		page,
		request
	}) => {
		const saves: string[] = [];
		page.on('request', (r) => {
			if (r.method() === 'POST' && new URL(r.url()).search === '?/saveMetadata') {
				saves.push(r.url());
			}
		});

		await gotoReady(page, editorPath(YEARS.duplicates));
		const first = problemRow(page, 1);
		const second = problemRow(page, 2);
		await expect(first.number).toHaveValue('T1');
		await second.number.fill('T1');

		await expect(
			page.getByText('Duplicate problem numbers: T1. Each problem number must be unique.')
		).toBeVisible();
		await expect(first.number).toHaveAttribute('aria-invalid', 'true');
		await expect(second.number).toHaveAttribute('aria-invalid', 'true');
		const save = page.getByRole('button', { name: 'Save metadata' });
		await expect(save).toBeDisabled();

		// The disabled button is one check. The form's guard (MetadataTab.svelte's
		// `saveError`) is the other, for a submission that doesn't go through the
		// button. `requestSubmit()` runs `use:enhance` as a real submit does
		// (ConfirmSubmit submits the same way). The guard toasts and cancels before
		// the fetch, so by the time its toast shows, a POST would have been sent.
		await second.number.evaluate((input: HTMLInputElement) => input.form?.requestSubmit());
		await expect(
			toast(page, 'Duplicate problem numbers found — please make them unique before saving.')
		).toBeVisible();
		expect(saves).toEqual([]);

		// Positive control: once fixed, the same form does POST, so the listener
		// above would have seen one.
		await second.number.fill('T2');
		await expect(save).toBeEnabled();
		await saveMetadata(page);
		expect(saves).toHaveLength(1);

		// A forged POST skips both. saveMetadata runs the editor's own check
		// (+page.server.ts: "Upserting duplicates over each other would lose one
		// problem's files").
		await postAction(
			request,
			`${editorPath(YEARS.duplicates)}?/saveMetadata`,
			{
				problemNumber: ['T1', 'T1'],
				problemTitle: ['One', 'Two'],
				problemTopics: ['[]', '[]'],
				problemMaxScore: ['', '']
			},
			{ failure: 400, message: 'Duplicate problem number: T1' }
		);

		// The refusal came before any write: both problems are as seeded.
		await gotoReady(page, editorPath(YEARS.duplicates));
		await expectProblem(page, 1, { number: 'T1', title: 'One', maxScore: '' });
		await expectProblem(page, 2, { number: 'T2', title: 'Two', maxScore: '' });
		await expect(problemRow(page, 3).number).toHaveCount(0);
	});

	test('a javascript: link is refused on save, and the draft is kept', async ({ page }) => {
		// +page.server.ts: the olympiad page renders links as hrefs, "so a
		// `javascript:` URL would be stored XSS against whoever clicks it". The
		// browser's `type="url"` check accepts it, so the refusal is the server's.
		await gotoReady(page, editorPath(YEARS.links));
		const label = (n: number) => page.getByLabel(`Link ${n} label`, { exact: true });
		const url = (n: number) => page.getByLabel(`Link ${n} URL`, { exact: true });
		await expect(label(1)).toHaveValue('Official site');

		await page.getByRole('button', { name: 'Add link' }).click();
		await label(2).fill('Evil');
		await url(2).fill('javascript:alert(1)');
		await page.getByRole('button', { name: 'Save metadata' }).click();
		await expect(
			toast(page, 'Link "Evil" must be a web address starting with http:// or https://')
		).toBeVisible();

		// An `actionFail`, not an `error()` (CLAUDE.md rule 6), so nothing typed is lost.
		await expect(label(2)).toHaveValue('Evil');
		await expect(url(2)).toHaveValue('javascript:alert(1)');
		await expect(label(1)).toHaveValue('Official site');
		await expect(page.getByLabel('Note 1', { exact: true })).toHaveValue('A seeded note.');

		// And nothing was stored.
		await gotoReady(page, editorPath(YEARS.links));
		await expect(label(1)).toHaveValue('Official site');
		await expect(url(1)).toHaveValue('https://example.org/meta-2004');
		await expect(label(2)).toHaveCount(0);
	});
});
