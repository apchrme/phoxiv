import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import { CDN_BASE_URL } from '../../../../src/lib/constants';
import { OWNED, PHRASES, USERS } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, toast } from '../../support/ui';

/*
 * The year editor's Files tab: text extraction in the browser on file pick, the
 * upload, the per-file status badge, and the uploaded text reaching deep search.
 * See docs/search.md, "The parser runs in the contributor's browser" and "The
 * write path".
 *
 * Owns OWNED.filesOlympiad, one year per test (OWNED.filesYears). The scanned
 * PDF goes to the seeded problem P1 of the upload year, so it never shares a
 * card with another test. Acts as the frozen USERS.admin.
 *
 * Uploads reach R2 only because the suite runs `wrangler dev`; under `vite dev`
 * a streamed `put()` fails (docs/testing.md, "The e2e server").
 */

test.use({ role: 'admin' });

const OLYMPIAD = OWNED.filesOlympiad;
const YEARS = OWNED.filesYears;

/** The problem seeded in the upload year for files to attach to. */
const PROBLEM_TITLE = 'Upload Target';

/**
 * text.pdf's extraction note. No `$`: the note's text ends in the space before
 * its (empty) `{#if detail}` block.
 */
const SEARCHABLE = /^2 pages, \d+ characters — searchable/;

/** `text.pdf`: two pages holding PHRASES.textPdf. `scanned.pdf`: one page that is only an image. */
function fixture(name: 'text.pdf' | 'scanned.pdf'): string {
	return fileURLToPath(new URL(`../../fixtures/files/${name}`, import.meta.url));
}

/**
 * Where a year-level upload is stored: the R2 key layout,
 * `olympiads/<id>/<year>/<slug>.<ext>`, behind the CDN (CLAUDE.md rule 3).
 */
function yearFileUrl(year: number, slug: string): string {
	return `${CDN_BASE_URL}/olympiads/${OLYMPIAD}/${year}/${slug}.pdf`;
}

/** Opens the year editor on its Files tab. */
async function openFilesTab(page: Page, year: number): Promise<void> {
	await gotoReady(page, `/contribute/${OLYMPIAD}/${year}`);
	await page.getByRole('tab', { name: 'Phase 2 — Files' }).click();
}

/**
 * One owner's upload card, by its title. Every card has the same "Label", "File"
 * and "Upload" controls, so a test scopes to one. The cards have no role;
 * `data-slot` is the card component's own hook.
 */
function card(page: Page, title: string): Locator {
	return page.locator('[data-slot="card"]').filter({ hasText: title });
}

/** Picks `file` in a card's upload form, which starts the extraction. */
async function pick(section: Locator, file: string): Promise<void> {
	await section.getByLabel('File', { exact: true }).setInputFiles(file);
}

/**
 * Labels the picked file and uploads it. The click waits for **Upload** to be
 * enabled, which it isn't while the text is still being read.
 */
async function upload(page: Page, section: Locator, label: string): Promise<void> {
	await section.getByLabel('Label', { exact: true }).fill(label);
	await section.getByRole('button', { name: 'Upload', exact: true }).click();
	await expect(toast(page, 'File uploaded')).toBeVisible();
}

/**
 * An uploaded file's label and its status badge, if it has one: "Problems", or
 * "Problems (indexing pending)". `ok`, the common case, has no badge.
 */
function fileLabel(section: Locator, label: string): Locator {
	return section.getByText(new RegExp(`^${label}\\b`));
}

test.describe('the year editor, Files tab', () => {
	test('a text PDF is previewed, uploaded and indexed', async ({ page }) => {
		await openFilesTab(page, YEARS.upload);
		const year = card(page, 'Year-level files');

		// The preview, before anything is stored. Also guards pdf-text.ts's
		// "calling it threw here, discarding every successful result": a throw while
		// tearing down the parse would turn this into "Couldn't read the text".
		await pick(year, fixture('text.pdf'));
		await expect(year.getByText(SEARCHABLE)).toBeVisible();

		await upload(page, year, 'Problems');

		// No badge: the extracted text went up with the file and the row is `ok`.
		await expect(fileLabel(year, 'Problems')).toHaveText('Problems');
		// Credited to whoever uploaded it.
		await expect(year.getByText(`Uploaded by ${USERS.admin.name}`)).toBeVisible();
		await expect(year.getByRole('link', { name: 'View' })).toHaveAttribute(
			'href',
			yearFileUrl(YEARS.upload, 'problems')
		);
	});

	test('the upload still succeeds when pdf.js cannot load, and waits as pending', async ({
		page
	}) => {
		// pdf.js is fetched only on file pick (pdf-text.ts), so blocking it here is
		// a dead parser: the same path as a deleted static/vendor/pdfjs/ or a
		// browser that can't run it.
		await page.route('/vendor/pdfjs/**', (route) => route.abort());
		await openFilesTab(page, YEARS.noParser);
		const year = card(page, 'Year-level files');

		await pick(year, fixture('text.pdf'));
		const note = year.getByText(/^Couldn't read the text\./);
		await expect(note).toContainText(
			'The file will still upload, and indexing will be retried later.'
		);
		// FileSection.svelte: "Don't drop `detail`: it's often the only clue to the
		// actual fault." Here the fault is the blocked module.
		await expect(note).toContainText('/vendor/pdfjs/pdf.min.mjs');

		// FileSection.svelte: "A failure still uploads, leaving a `pending` row for
		// the backfill", and +page.server.ts: "Nothing below this line may fail the
		// upload."
		await upload(page, year, 'Problems');

		// `pending` ("not indexed yet"), never `error` ("indexing failed"): the
		// backfill retries it.
		await expect(fileLabel(year, 'Problems')).toHaveText('Problems (indexing pending)');
	});

	test('an uploaded phrase is found by deep search', async ({ page, request }) => {
		await openFilesTab(page, YEARS.search);
		const year = card(page, 'Year-level files');
		await pick(year, fixture('text.pdf'));
		await expect(year.getByText(SEARCHABLE)).toBeVisible();
		await upload(page, year, 'Problems');

		// The upload wrote a `file_text` row; only the FTS5 triggers put it in the
		// index. PHRASES.textPdf is nowhere in the seed, so a hit can only come from
		// an upload. The first test uploads text.pdf to this olympiad too, so look
		// for this year's url rather than counting results.
		//
		// `no-cache` bypasses the shared cache, so the answer is this run's index,
		// not a body stored before the upload.
		const params = new URLSearchParams({ q: PHRASES.textPdf, olympiad: OLYMPIAD });
		const response = await request.get(`/api/search/files?${params}`, {
			headers: { 'cache-control': 'no-cache' }
		});
		expect(response.status()).toBe(200);
		const { results } = await response.json();

		const url = yearFileUrl(YEARS.search, 'problems');
		const urls = results.map((r: { file: { url: string } }) => r.file.url);
		expect(urls).toContain(url);

		const hit = results.find((r: { file: { url: string } }) => r.file.url === url);
		expect(hit).toMatchObject({
			olympiadId: OLYMPIAD,
			year: YEARS.search,
			file: { label: 'Problems', url },
			problems: []
		});
		expect(hit.snippet.toLowerCase()).toContain(PHRASES.textPdf);
	});

	test('a scanned PDF is flagged before upload and still uploads', async ({ page }) => {
		await openFilesTab(page, YEARS.upload);
		const problem = card(page, PROBLEM_TITLE);

		// Flagged on pick, while the contributor can still swap it for a text PDF.
		await pick(problem, fixture('scanned.pdf'));
		await expect(
			problem.getByText(
				'No text found — this looks like a scanned PDF. It will upload fine, but it will not be searchable.'
			)
		).toBeVisible();

		await upload(page, problem, 'Scan');

		// `empty`, not `pending`: a scan sends no text, so FileSection.svelte's
		// `extractedEmpty` field is all that keeps it out of the backfill's queue,
		// which would only refetch it to reach the same verdict.
		await expect(problem.getByRole('button', { name: 'Delete Scan' })).toBeVisible();
		await expect(fileLabel(problem, 'Scan')).toHaveText('Scan (no text)');
	});

	test('a refused upload keeps the pick, so the retry still lands as a scan', async ({ page }) => {
		// FileSection.svelte's `clearPick`: "Not in `onDone`: that runs after a
		// refusal too, and it cleared the label and the extracted text while the
		// file stayed picked, so a retry uploaded the file with no text".
		await openFilesTab(page, YEARS.retry);
		const year = card(page, 'Year-level files');
		await pick(year, fixture('scanned.pdf'));
		const note = year.getByText(
			'No text found — this looks like a scanned PDF. It will upload fine, but it will not be searchable.'
		);
		await expect(note).toBeVisible();

		// Spaces pass the browser's `required` and the label checks; the server
		// trims them to nothing and refuses.
		const label = year.getByLabel('Label', { exact: true });
		await label.fill('   ');
		await year.getByRole('button', { name: 'Upload', exact: true }).click();
		await expect(toast(page, 'Label is required')).toBeVisible();
		await expect(label).toHaveValue('   ');
		await expect(note).toBeVisible();

		// The file is still picked, and still known to be a scan.
		await upload(page, year, 'Scan');
		await expect(fileLabel(year, 'Scan')).toHaveText('Scan (no text)');
	});
});
