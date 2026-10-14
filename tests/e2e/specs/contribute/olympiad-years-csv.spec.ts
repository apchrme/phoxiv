import { readFile } from 'node:fs/promises';
import type { APIRequestContext, Locator, Page, Response } from '@playwright/test';
import { parse } from 'devalue';
import { OWNED } from '../../fixtures/seed-data';
import { postAction, type FilePayload } from '../../support/actions';
import { expect, test } from '../../support/test';
import { gotoReady, holdAction, toast } from '../../support/ui';

/*
 * The olympiad editor (`/contribute/<olympiad>`): adding a year from the Years
 * card (`?/selectYear`), and the titles.csv round trip: the export
 * (`titles.csv/+server.ts`) and the import (`?/importTitles`). The two share a
 * format, docs/data-model.md, "The `titles.csv` contract".
 *
 * Owns two olympiads. OWNED.csvOlympiad's problems never change: its export is
 * checked byte for byte, re-imported unchanged, and every refused import must
 * leave it so. The year the Years test adds has no problems, so it never reaches
 * the export. OWNED.csvFillOlympiad takes the one import that writes. Acts as
 * the frozen USERS.admin.
 *
 * Every write is read back through what is never cached: the editors and
 * titles.csv itself, which is not under `/api/`.
 */

test.use({ role: 'admin' });

const OLYMPIAD = OWNED.csvOlympiad;
const FILL_OLYMPIAD = OWNED.csvFillOlympiad;

const HEADER = 'year,number,title,topics,max_score';

/** A file's text as the export writes it: a BOM first, CRLF after every line. */
function exported(...lines: string[]): string {
	return '﻿' + lines.map((line) => `${line}\r\n`).join('');
}

/**
 * OWNED.csvOlympiad's titles.csv, written out so a change to the format fails
 * here. By year, then by problem id: 2002's rows have the lower ids. T2 has
 * nothing set. T3's title is quoted for its comma and its doubled quotes, and its
 * maximum is written in full (titles.csv/+server.ts: "`exactScore`, not
 * `formatScore`, so the round-trip is lossless"); rounded, it would be 0. The
 * BOM is there "so Excel reads accented titles correctly", such as "É".
 */
const EXPORT = exported(
	HEADER,
	'2001,T1,Spinning Top,Mechanics;Waves and Optics,10',
	'2001,T2,,,',
	'2001,T3,"Springs, ""Coupled""",,0.001',
	'2002,1,Électron Gun,Electromagnetism,7.5'
);

function editorPath(olympiad: string): string {
	return `/contribute/${olympiad}`;
}

/** The Years card. Cards have no role; `data-slot` is the vendored Card's own hook. */
function yearsCard(page: Page): Locator {
	return page
		.locator('[data-slot="card"]')
		.filter({ has: page.getByText('Years', { exact: true }) });
}

/** The Years card's links, one per year, newest first. */
function yearLinks(page: Page): Locator {
	return yearsCard(page).getByRole('link');
}

function importButton(page: Page): Locator {
	return page.getByRole('button', { name: 'Import titles', exact: true });
}

/** A CSV upload of `lines`, CRLF-terminated, without a BOM. */
function csvFile(name: string, ...lines: string[]): FilePayload {
	return {
		name,
		mimeType: 'text/csv',
		buffer: Buffer.from(lines.map((line) => `${line}\r\n`).join(''), 'utf8')
	};
}

/**
 * Downloads titles.csv through the editor's **Export titles** link and returns
 * its bytes, BOM included.
 */
async function exportTitles(page: Page, olympiad: string): Promise<Buffer> {
	const downloaded = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Export titles', exact: true }).click();
	const download = await downloaded;
	expect(download.suggestedFilename()).toBe(`${olympiad}-titles.csv`);
	return readFile(await download.path());
}

/** titles.csv as the server has it now. `body()` decoded by hand keeps the BOM. */
async function currentExport(api: APIRequestContext, olympiad: string): Promise<string> {
	const response = await api.get(`/contribute/${olympiad}/titles.csv`);
	expect(response.status()).toBe(200);
	return (await response.body()).toString('utf8');
}

/** Picks `file` in the import card, submits it, and resolves with the action's answer. */
async function importCsv(page: Page, file: FilePayload): Promise<Response> {
	// The input has no visible label; ImportTitlesCard.svelte names it.
	await page.getByLabel('CSV file', { exact: true }).setInputFiles(file);
	const answer = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' && new URL(response.url()).search === '?/importTitles'
	);
	await importButton(page).click();
	return answer;
}

/**
 * Expects `importTitles` to have refused with `actionFail(400, …, message)`, and
 * the page to toast it.
 *
 * `actionFail()` answers HTTP 200 with `type: 'failure'`; `error()` would answer
 * `type: 'error'` and replace the page ($lib/server/forms.ts: "`error()`
 * replaces the page and discards what the user typed"; CLAUDE.md rule 6).
 */
async function expectImportRefused(page: Page, answer: Response, message: string): Promise<void> {
	const body = (await answer.json()) as { type: string; status: number; data: string };
	expect(answer.status()).toBe(200);
	expect(body.type).toBe('failure');
	expect(body.status).toBe(400);
	expect((parse(body.data) as { error: string }).error).toBe(message);
	// Toasts vanish after four seconds, so straight after the answer.
	await expect(toast(page, message)).toBeVisible();
}

test.describe('the olympiad editor, Years card', () => {
	test('adds a new year, opens an existing one, and lists each once', async ({ page }) => {
		await gotoReady(page, editorPath(OLYMPIAD));
		const card = yearsCard(page);
		const year = card.getByLabel('Year', { exact: true });
		const go = card.getByRole('button', { name: 'Add / go to year', exact: true });
		await expect(yearLinks(page)).toHaveText(['2002', '2001']);

		// A new year: `ensureYear` creates it and the action redirects to its editor.
		await year.fill('2030');
		await go.click();
		await expect(page).toHaveURL(`/contribute/${OLYMPIAD}/2030`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('CSV Physics Olympiad 2030');
		await expect(page.getByText(`Editing ${OLYMPIAD}/2030`)).toBeVisible();
		await expect(page.getByLabel('Problem 1 number', { exact: true })).toHaveCount(0);

		// The olympiad editor's load is never cached, so it lists the year at once.
		await page.getByRole('link', { name: 'Back to CSV Physics Olympiad' }).click();
		await expect(page).toHaveURL(editorPath(OLYMPIAD));
		await expect(yearLinks(page)).toHaveText(['2030', '2002', '2001']);

		// An existing year opens with its problems, and isn't added a second time.
		await year.fill('2001');
		await go.click();
		await expect(page).toHaveURL(`/contribute/${OLYMPIAD}/2001`);
		await expect(page.getByLabel('Problem 1 title', { exact: true })).toHaveValue('Spinning Top');

		await page.getByRole('link', { name: 'Back to CSV Physics Olympiad' }).click();
		await expect(page).toHaveURL(editorPath(OLYMPIAD));
		await expect(yearLinks(page)).toHaveText(['2030', '2002', '2001']);
	});

	test('a year out of range is refused by the server', { tag: '@smoke' }, async ({ request }) => {
		// The input's `min` and `max` stop the browser sending it; `parseYear` is
		// the check for everything else. YEAR_RANGE_ERROR in $lib/server/forms.ts.
		for (const year of ['1899', '2101', 'next']) {
			await postAction(
				request,
				`${editorPath(OLYMPIAD)}?/selectYear`,
				{ year },
				{ failure: 400, message: 'Please enter a valid year (1900-2100)' }
			);
		}
	});
});

test.describe('titles.csv', () => {
	test('the export holds every problem, in the contract format', async ({ page }) => {
		await gotoReady(page, editorPath(OLYMPIAD));
		const bytes = await exportTitles(page, OLYMPIAD);
		expect(bytes.toString('utf8')).toBe(EXPORT);
	});

	test('re-importing the export unchanged changes nothing', async ({ page }) => {
		await gotoReady(page, editorPath(OLYMPIAD));
		const bytes = await exportTitles(page, OLYMPIAD);
		expect(bytes.toString('utf8')).toBe(EXPORT);

		// The bytes exactly as downloaded, BOM and all. The import reads the header
		// through `trim()`, which drops the BOM, so the round trip guards that too.
		await page
			.getByLabel('CSV file', { exact: true })
			.setInputFiles({ name: `${OLYMPIAD}-titles.csv`, mimeType: 'text/csv', buffer: bytes });

		// Held, so the busy state stays on screen. The card's button reads the
		// page's one `Pending` (CLAUDE.md rule 5), or it would never disable.
		const release = await holdAction(page, editorPath(OLYMPIAD), 'importTitles');
		await importButton(page).click();
		await expect(page.getByRole('button', { name: 'Loading Importing…' })).toBeDisabled();
		release();

		// "Fill-only: existing values are never overwritten, so re-importing is
		// safe" (`importTitles` in +page.server.ts). T2 has nothing set, and the CSV
		// offers nothing for it, so it is kept too.
		await expect(
			toast(
				page,
				'Import complete — 0 created, 0 titles filled, 0 topics filled, 0 max scores filled, 4 kept.'
			)
		).toBeVisible();
		// The page clears the picked file once an import lands.
		await expect(importButton(page)).toBeDisabled();
		await expect(page.getByLabel('CSV file', { exact: true })).toHaveValue('');

		expect((await exportTitles(page, OLYMPIAD)).toString('utf8')).toBe(EXPORT);
	});

	test('an edited CSV fills what is blank and never overwrites', async ({ page, request }) => {
		await gotoReady(page, editorPath(FILL_OLYMPIAD));
		const text = (await exportTitles(page, FILL_OLYMPIAD)).toString('utf8');
		expect(text).toBe(exported(HEADER, '2001,T1,Kept Title,,', '2001,T2,,,'));

		// Edited as in a spreadsheet: both titles changed, T2's topics and maximum
		// filled in, and rows added for a year the olympiad doesn't have yet. One
		// added row has a `/` in its number, which "would nest the problem's R2
		// keys" (`importTitles`), one a maximum of 0, and one repeats P1: a
		// duplicate meets the problem its first row just created, and is kept.
		const edited =
			text
				.replace('2001,T1,Kept Title,,', '2001,T1,Overwritten Title,,')
				.replace('2001,T2,,,', '2001,T2,Filled Title,Thermodynamics,5') +
			[
				'2005,P1,Brand New,Others,12',
				'2005,P2/x,Slashed,,',
				'2005,P3,Bad Score,,0',
				'2005,P1,Duplicate Title,Mechanics,3'
			]
				.map((line) => `${line}\r\n`)
				.join('');
		await importCsv(page, {
			name: `${FILL_OLYMPIAD}-titles.csv`,
			mimeType: 'text/csv',
			buffer: Buffer.from(edited, 'utf8')
		});
		await expect(
			toast(
				page,
				'Import complete — 2 created, 1 titles filled, 1 topics filled, 1 max scores filled, ' +
					'2 kept, 1 years added, 1 invalid rows skipped, 1 max scores ignored.'
			)
		).toBeVisible();

		// The action's `update()` re-runs the load, so the new year is listed
		// without a reload.
		await expect(yearLinks(page)).toHaveText(['2005', '2001']);

		// The blank title was filled, and the set one kept: the import "only fills
		// gaps" (docs/data-model.md).
		await gotoReady(page, `${editorPath(FILL_OLYMPIAD)}/2001`);
		await expect(page.getByLabel('Problem 1 title', { exact: true })).toHaveValue('Kept Title');
		await expect(page.getByLabel('Problem 2 title', { exact: true })).toHaveValue('Filled Title');
		await expect(page.getByLabel('Problem 2 maximum score', { exact: true })).toHaveValue('5');

		// The year was created with its rows, once each and without the slashed
		// one, and the unreadable maximum was left blank.
		await gotoReady(page, `${editorPath(FILL_OLYMPIAD)}/2005`);
		await expect(page.getByLabel('Problem 1 number', { exact: true })).toHaveValue('P1');
		await expect(page.getByLabel('Problem 1 title', { exact: true })).toHaveValue('Brand New');
		await expect(page.getByLabel('Problem 1 maximum score', { exact: true })).toHaveValue('12');
		await expect(page.getByLabel('Problem 2 number', { exact: true })).toHaveValue('P3');
		await expect(page.getByLabel('Problem 2 maximum score', { exact: true })).toHaveValue('');
		await expect(page.getByLabel('Problem 3 number', { exact: true })).toHaveCount(0);

		// And every field, topics included, as the next export has it.
		expect(await currentExport(request, FILL_OLYMPIAD)).toBe(
			exported(
				HEADER,
				'2001,T1,Kept Title,,',
				'2001,T2,Filled Title,Thermodynamics,5',
				'2005,P1,Brand New,Others,12',
				'2005,P3,Bad Score,,'
			)
		);
	});

	// Each refusal comes before any write. The files that get as far as a row
	// carry one for a year the olympiad doesn't have, which a refusal that let it
	// through would write as a new year and problem.
	const WOULD_WRITE = '2099,P1,Never Written';

	const refusals: { what: string; file: FilePayload; message: string }[] = [
		{
			what: 'an empty file',
			file: { name: 'titles.csv', mimeType: 'text/csv', buffer: Buffer.alloc(0) },
			message: 'No file provided'
		},
		{
			// `accept` is only a hint; the server checks the extension.
			what: 'a file that is not a .csv',
			file: csvFile('titles.txt', 'year,number,title', WOULD_WRITE),
			message: 'Unsupported file type. Use CSV.'
		},
		{
			// Blank lines are skipped, so only the size is wrong.
			what: 'a file over 1 MB',
			file: csvFile('titles.csv', 'year,number,title', WOULD_WRITE, '\r\n'.repeat(512 * 1024)),
			message: 'File too large (max 1 MB)'
		},
		{
			what: 'a CSV with an unclosed quote',
			file: csvFile('titles.csv', 'year,number,title', WOULD_WRITE, '2099,"P2,Unclosed'),
			message: 'Could not parse CSV file'
		},
		{
			what: 'a header with no rows',
			file: csvFile('titles.csv', HEADER),
			message: 'CSV appears to be empty'
		},
		{
			what: 'a header without a title column',
			file: csvFile('titles.csv', 'year,number,name', WOULD_WRITE),
			message: 'CSV must have "year", "number", and "title" columns'
		},
		{
			// A `/` in the number, years out of range or unreadable, no number.
			what: 'rows that are all invalid',
			file: csvFile(
				'titles.csv',
				'year,number,title',
				'2099,P1/a,Slashed',
				'1899,P2,Too Early',
				'2101,P3,Too Late',
				'next,P4,Not a Year',
				'2099,,No Number'
			),
			message: 'No valid rows found for this olympiad'
		}
	];

	for (const { what, file, message } of refusals) {
		test(`refuses ${what}, and writes nothing`, async ({ page, request }) => {
			await gotoReady(page, editorPath(OLYMPIAD));
			await expectImportRefused(page, await importCsv(page, file), message);

			// Still on the page, with the file still picked for another try.
			await expect(page).toHaveURL(editorPath(OLYMPIAD));
			await expect(importButton(page)).toBeEnabled();
			await expect(page.getByRole('button', { name: 'Clear', exact: true })).toBeVisible();

			expect(await currentExport(request, OLYMPIAD)).toBe(EXPORT);
			await gotoReady(page, editorPath(OLYMPIAD));
			await expect(yearLinks(page).filter({ hasText: '2099' })).toHaveCount(0);
		});
	}
});
