import type { Page } from '@playwright/test';
import { CDN_BASE_URL } from '../../../../src/lib/constants';
import { OWNED } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { confirmDialog, gotoReady, toast } from '../../support/ui';

/*
 * The olympiad editor's icon: upload, save metadata alongside it, remove.
 *
 * Owns OWNED.iconOlympiad. Every test starts by uploading an icon, so none
 * depends on what an earlier test left behind; they only need to run one at a
 * time, which `fullyParallel: false` guarantees within a file.
 *
 * Uploads need R2, which only `wrangler dev` gives the suite (docs/testing.md,
 * "The e2e server"). The browser never loads the uploaded image: the CDN is
 * external, so the `test` fixture aborts the request.
 */

test.use({ role: 'admin' });

const EDITOR = `/contribute/${OWNED.iconOlympiad}`;

/**
 * Where the icon must land. Written out rather than taken from `iconKey`, so a
 * change to the R2 key layout fails here: the database stores full CDN urls,
 * and changing the layout orphans every stored object (CLAUDE.md rule 3).
 */
const ICON_URL = `${CDN_BASE_URL}/icons/olympiads/${OWNED.iconOlympiad}.png`;

/** A valid 1×1 transparent PNG. The server checks only the extension, but a real image previews. */
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);

/** Picks the PNG in the icon card and uploads it, through the UI. */
async function uploadIcon(page: Page): Promise<void> {
	// A file name unlike the key, so the key is shown to come from the olympiad id.
	await page
		.getByLabel('Image file')
		.setInputFiles({ name: 'Uploaded Logo.png', mimeType: 'image/png', buffer: PNG });
	await expect(page.getByText('New icon selected')).toBeVisible();
	await page.getByRole('button', { name: 'Upload icon', exact: true }).click();
	await expect(toast(page, 'Icon uploaded')).toBeVisible();
}

/** The emoji field in the metadata form, which an uploaded icon disables. */
function emojiField(page: Page) {
	return page.getByLabel('Emoji icon');
}

/** Asserts the icon card and the emoji field both show `ICON_URL` as the icon. */
async function expectUploadedIcon(page: Page): Promise<void> {
	await expect(page.getByText('Custom uploaded icon')).toBeVisible();
	await expect(page.getByText(ICON_URL, { exact: true })).toBeVisible();
	await expect(emojiField(page)).toBeDisabled();
	await expect(emojiField(page)).toHaveValue(ICON_URL);
}

test.describe('the olympiad editor icon', () => {
	test('an uploaded icon is stored under the R2 key layout', async ({ page, blockedRequests }) => {
		await gotoReady(page, EDITOR);
		await uploadIcon(page);

		// The url the action returned, before any reload.
		await expectUploadedIcon(page);
		// The page renders it as an image; the CDN request is the one the fixture aborts.
		await expect.poll(() => blockedRequests).toContain(ICON_URL);

		// And the url the database stored.
		await page.reload();
		await expectUploadedIcon(page);
	});

	test('saving the metadata keeps an uploaded icon', async ({ page }) => {
		// Regression: src/routes/contribute/[olympiad]/+page.server.ts, "Don't write
		// `''` here: that silently deleted uploaded icons", and its client half in
		// OlympiadMetadataForm.svelte, "Don't submit `''` instead: that wiped uploaded
		// icons". The emoji field is disabled while an upload is set, so the save
		// sends no `icon` and the action must leave the column alone.
		await gotoReady(page, EDITOR);
		await uploadIcon(page);
		await expectUploadedIcon(page);

		const summary = 'Saved after an icon upload.';
		await page.getByLabel('Summary', { exact: true }).fill(summary);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(toast(page, 'Olympiad updated')).toBeVisible();

		await page.reload();
		// The save landed...
		await expect(page.getByLabel('Summary', { exact: true })).toHaveValue(summary);
		// ...and the icon survived it.
		await expectUploadedIcon(page);
	});

	test('removing the icon clears it', async ({ page }) => {
		await gotoReady(page, EDITOR);
		await uploadIcon(page);
		await expectUploadedIcon(page);

		await page.getByRole('button', { name: 'Remove icon' }).click();
		const dialog = confirmDialog(page);
		await expect(dialog).toContainText('Remove the uploaded icon?');
		await dialog.getByRole('button', { name: 'Remove icon' }).click();
		await expect(toast(page, 'Icon removed')).toBeVisible();

		// Cleared, not reverted to the seeded emoji: the upload overwrote it, and
		// `removeIcon` writes `''`.
		await expect(page.getByText('No icon set')).toBeVisible();
		await expect(page.getByText(ICON_URL, { exact: true })).toBeHidden();
		await expect(emojiField(page)).toBeEnabled();
		await expect(emojiField(page)).toHaveValue('');

		await page.reload();
		await expect(page.getByText('No icon set')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Remove icon' })).toBeHidden();
		await expect(emojiField(page)).toBeEnabled();
		await expect(emojiField(page)).toHaveValue('');
	});
});
