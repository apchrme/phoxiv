import { fileURLToPath } from 'node:url';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { YEAR_NOT_FOUND } from '../../../../src/lib/server/db/queries/years';
import type { FileSearchResponse } from '../../../../src/lib/types';
import { DEL_FILE_URLS, DEL_WITNESSES, OWNED, PHRASES } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { confirmDialog, gotoReady, holdAction, toast } from '../../support/ui';

/*
 * Deleting from the year editor (`/contribute/<olympiad>/<year>`): a file from
 * the Files tab, and the whole year from the metadata tab. Both ask first
 * (ConfirmSubmit), and both must take the files' indexed text with them, so deep
 * search stops finding it. See docs/data-model.md, "Every arrow is `ON DELETE
 * CASCADE`", and docs/search.md.
 *
 * Owns OWNED.delOlympiad, one year per test (OWNED.delYears), plus a witness
 * year that is only ever searched. Acts as the frozen USERS.admin.
 *
 * A `file_text` row left behind never shows as a result: search joins every hit
 * back to the file tables (queries/files.ts: "stale `file_text` row can never
 * produce a result"). But `searchFiles` decides `truncated` from the index hits, before
 * that join. So the witness year holds DEL_WITNESSES files, one full page, that
 * share a count phrase with the files a test deletes. A scoped search for that
 * phrase is `truncated` while any deleted file's row is left, and fills the page
 * exactly once they are all gone. Nothing else the app serves shows whether a
 * delete dropped the row.
 *
 * Seeded objects are not in R2 (docs/testing.md, "Seed data"); deleting a
 * missing object is a no-op, so the deletes run as they would in production.
 */

test.use({ role: 'admin' });

const OLYMPIAD = OWNED.delOlympiad;
const YEARS = OWNED.delYears;

/** The seeded olympiad's name, as the year-delete dialog's title gives it. */
const OLYMPIAD_NAME = 'Erasure Physics Olympiad';

/**
 * text.pdf's extraction note. No `$`: the note's text ends in the space before
 * its (empty) `{#if detail}` block.
 */
const SEARCHABLE = /^2 pages, \d+ characters — searchable/;

/** `text.pdf`: two pages holding PHRASES.textPdf. */
function fixture(name: 'text.pdf'): string {
	return fileURLToPath(new URL(`../../fixtures/files/${name}`, import.meta.url));
}

function editorPath(year: number): string {
	return `/contribute/${OLYMPIAD}/${year}`;
}

/** Opens the year editor on its Files tab. */
async function openFilesTab(page: Page, year: number): Promise<void> {
	await gotoReady(page, editorPath(year));
	await page.getByRole('tab', { name: 'Phase 2 — Files' }).click();
}

/**
 * One owner's files card, by its title. Every card has the same controls, so a
 * test scopes to one. Cards have no role; `data-slot` is the vendored Card's own
 * hook.
 */
function card(page: Page, title: string): Locator {
	return page.locator('[data-slot="card"]').filter({ hasText: title });
}

/** A file's ConfirmSubmit trigger, named by FileSection.svelte's sr-only "Delete <label>". */
function deleteButton(section: Locator, label: string): Locator {
	return section.getByRole('button', { name: `Delete ${label}`, exact: true });
}

/**
 * Deletes a file through its confirmation dialog, then waits for the toast and
 * for the row to leave the list. Only one "File deleted" toast may be on screen
 * for the toast check, so a second delete needs a fresh page.
 */
async function deleteFile(page: Page, section: Locator, label: string): Promise<void> {
	await deleteButton(section, label).click();
	const dialog = confirmDialog(page);
	await expect(dialog).toHaveAccessibleName(`Delete "${label}"?`);
	await dialog.getByRole('button', { name: 'Delete file' }).click();
	await expect(toast(page, 'File deleted')).toBeVisible();
	await expect(deleteButton(section, label)).toHaveCount(0);
}

/**
 * Deep search scoped to this spec's olympiad. `no-cache` makes the adapter's
 * worker skip the shared cache, which would otherwise answer with the body from
 * before a delete.
 */
async function deepSearch(request: APIRequestContext, q: string): Promise<FileSearchResponse> {
	const params = new URLSearchParams({ q, olympiad: OLYMPIAD });
	const response = await request.get(`/api/search/files?${params}`, {
		headers: { 'cache-control': 'no-cache' }
	});
	expect(response.status()).toBe(200);
	return response.json();
}

/** The urls a search returned, sorted, for comparing as a set. */
async function foundUrls(request: APIRequestContext, q: string): Promise<string[]> {
	return (await deepSearch(request, q)).results.map((r) => r.file.url).sort();
}

/**
 * Before a delete: the files about to go push a count phrase's hits one page
 * over. A full page and `truncated` also proves DEL_WITNESSES still equals
 * DEEP_SEARCH_LIMIT, which the checks after the delete depend on.
 */
async function expectCountOverflows(request: APIRequestContext, phrase: string): Promise<void> {
	const body = await deepSearch(request, phrase);
	expect(body.results).toHaveLength(DEL_WITNESSES);
	expect(body.truncated).toBe(true);
}

/**
 * After a delete: a count phrase finds the witness files and nothing else, a
 * full page that is not `truncated`. A deleted file's `file_text` row left in
 * the index would be one hit too many: never a result, but `truncated`.
 */
async function expectWitnessesOnly(request: APIRequestContext, phrase: string): Promise<void> {
	const body = await deepSearch(request, phrase);
	expect(body.truncated, "a deleted file's file_text row is still indexed").toBe(false);
	expect(body.results.map((r) => r.year)).toEqual(Array(DEL_WITNESSES).fill(YEARS.witness));
}

test.describe('deleting from the year editor', () => {
	test('a deleted file leaves the editor, deep search and the index', async ({ page, request }) => {
		// Year 2001's year-level Problems and T1's Solution share PHRASES.delFile.
		expect(await foundUrls(request, PHRASES.delFile)).toEqual(
			[DEL_FILE_URLS.fileProblems, DEL_FILE_URLS.fileT1].sort()
		);
		await expectCountOverflows(request, PHRASES.delFileCount);

		await openFilesTab(page, YEARS.file);
		const year = card(page, 'Year-level files');
		await deleteFile(page, year, 'Problems');
		// Only that file: its sibling in the same year is still listed.
		await expect(deleteButton(year, 'Solutions')).toBeVisible();

		// A problem's file takes deleteFile's other branch, which finds the problem
		// by the form's hidden `problemNumber`. A fresh page, so the first toast is
		// gone.
		await openFilesTab(page, YEARS.file);
		const problem = card(page, 'Pruned Problem');
		await deleteFile(page, problem, 'Solution');

		// What the server kept.
		await openFilesTab(page, YEARS.file);
		await expect(deleteButton(year, 'Solutions')).toBeVisible();
		await expect(deleteButton(year, 'Problems')).toHaveCount(0);
		await expect(deleteButton(problem, 'Solution')).toHaveCount(0);

		expect(await foundUrls(request, PHRASES.delFile)).toEqual([]);
		// The search above would pass with the text rows still there.
		// +page.server.ts's deleteFile drops them anyway: "Best-effort: the file is
		// already gone, and search joins back to the file tables, so a leftover
		// text row is never shown." This is the only check that it does.
		await expectWitnessesOnly(request, PHRASES.delFileCount);
	});

	test('a file deleted and uploaded again under its label is one file, with the new text', async ({
		page,
		request
	}) => {
		expect(await foundUrls(request, PHRASES.delReplaced)).toEqual([DEL_FILE_URLS.reupload]);

		await openFilesTab(page, YEARS.reupload);
		const year = card(page, 'Year-level files');
		await deleteFile(page, year, 'Problems');

		await year.getByLabel('File', { exact: true }).setInputFiles(fixture('text.pdf'));
		await expect(year.getByText(SEARCHABLE)).toBeVisible();
		await year.getByLabel('Label', { exact: true }).fill('Problems');
		// The label is free again. The upload's guard reads the list the delete
		// reloaded (FileSection.svelte: "Props are lazy getters, so this sees the
		// current `existingFiles`"); a stale list would refuse the upload as "A
		// file named "Problems" already exists".
		await expect(year.getByText(/already exists/)).toHaveCount(0);
		await year.getByRole('button', { name: 'Upload', exact: true }).click();
		await expect(toast(page, 'File uploaded')).toBeVisible();

		// One row for the label, at the deleted file's url: the same label is the
		// same R2 key. No badge: the new text went up with the file, so it is `ok`.
		await openFilesTab(page, YEARS.reupload);
		await expect(deleteButton(year, 'Problems')).toHaveCount(1);
		await expect(year.getByRole('link', { name: 'View' })).toHaveAttribute(
			'href',
			DEL_FILE_URLS.reupload
		);
		await expect(year.getByText(/^Problems\b/)).toHaveText('Problems');

		// The new file's text is indexed under that url, and the old file's is not.
		const replaced = await deepSearch(request, PHRASES.textPdf);
		expect(replaced.results).toHaveLength(1);
		expect(replaced.results[0]).toMatchObject({
			olympiadId: OLYMPIAD,
			year: YEARS.reupload,
			file: { label: 'Problems', url: DEL_FILE_URLS.reupload },
			problems: []
		});
		expect(replaced.results[0].snippet.toLowerCase()).toContain(PHRASES.textPdf);
		expect(await foundUrls(request, PHRASES.delReplaced)).toEqual([]);
	});

	test('a deleted year redirects to its olympiad, leaves deep search and 404s', async ({
		page,
		request
	}) => {
		// Year 2003's year-level Problems and T1's Solution share PHRASES.delYear.
		expect(await foundUrls(request, PHRASES.delYear)).toEqual(
			[DEL_FILE_URLS.yearProblems, DEL_FILE_URLS.yearT1].sort()
		);
		await expectCountOverflows(request, PHRASES.delYearCount);

		await gotoReady(page, editorPath(YEARS.year));
		await page.getByRole('button', { name: 'Delete this year' }).click();
		const dialog = confirmDialog(page);
		await expect(dialog).toHaveAccessibleName(`Delete ${OLYMPIAD_NAME} ${YEARS.year}?`);

		const release = await holdAction(page, editorPath(YEARS.year), 'deleteYear');
		await dialog.getByRole('button', { name: 'Delete year' }).click();
		await expect(dialog).toBeHidden();
		// MetadataTab.svelte: "Keep this a sibling of the form above. Nested, the
		// parser drops this tag and the button would submit `?/saveMetadata`
		// instead." Only a held `?/deleteYear` submission marks this trigger busy.
		await expect(page.getByRole('button', { name: 'Loading Delete this year' })).toBeDisabled();
		release();

		// deleteYear redirects to the olympiad, whose load lists the years afresh.
		await expect(page).toHaveURL(`/contribute/${OLYMPIAD}`);
		await expect(
			page.getByRole('link', { name: String(YEARS.witness), exact: true })
		).toBeVisible();
		await expect(page.getByRole('link', { name: String(YEARS.year), exact: true })).toHaveCount(0);

		// Both files went with the year, and so did their text rows: deleteYear's
		// cleanup is "Best-effort", so only the count shows it ran.
		expect(await foundUrls(request, PHRASES.delYear)).toEqual([]);
		await expectWitnessesOnly(request, PHRASES.delYearCount);

		// The editor's own load now refuses the year.
		const response = await page.goto(editorPath(YEARS.year));
		expect(response?.status()).toBe(404);
		await expect(page.getByRole('heading', { name: `Error 404: ${YEAR_NOT_FOUND}` })).toBeVisible();
	});
});
