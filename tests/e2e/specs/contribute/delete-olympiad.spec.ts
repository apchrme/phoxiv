import type { APIRequestContext } from '@playwright/test';
import type { FileSearchResponse } from '../../../../src/lib/types';
import { NUKE_FILE, OWNED } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { answerDialogs, confirmDialog, gotoReady } from '../../support/ui';

/*
 * Deleting a whole olympiad, which only the superadmin may do. See docs/auth.md,
 * "The superadmin", and docs/data-model.md.
 *
 * Owns OWNED.nukeOlympiad (and USERS.nukeAssignee, assigned to it). Seeded
 * objects are not in R2; deleting a missing object is a no-op.
 */

const OLYMPIAD = OWNED.nukeOlympiad;
const NAME = 'Demolition Physics Olympiad';
const DELETE_TRIGGER = 'Delete this olympiad';

async function deepSearch(request: APIRequestContext, q: string): Promise<FileSearchResponse> {
	const params = new URLSearchParams({ q, olympiad: OLYMPIAD });
	const response = await request.get(`/api/search/files?${params}`, {
		headers: { 'cache-control': 'no-cache' }
	});
	expect(response.status()).toBe(200);
	return response.json();
}

test.describe('deleting an olympiad', () => {
	test.describe('as an admin', () => {
		test.use({ role: 'admin' });

		test('is not offered the button', async ({ page }) => {
			await gotoReady(page, `/contribute/${OLYMPIAD}`);
			await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
			await expect(page.getByRole('button', { name: DELETE_TRIGGER })).toHaveCount(0);
		});
	});

	test.describe('as the superadmin', () => {
		test.use({ role: 'superadmin' });

		test('removes the olympiad, its year, its files and its assignment', async ({
			page,
			request,
			apiAs
		}) => {
			const assignee = await apiAs('nukeAssignee');
			expect((await assignee.get(`/contribute/${OLYMPIAD}`)).status()).toBe(200);
			expect((await deepSearch(request, NUKE_FILE.phrase)).results).toHaveLength(1);

			await gotoReady(page, `/contribute/${OLYMPIAD}`);
			// An unsaved edit must not make the redirect ask to leave.
			const dialogs = answerDialogs(page, false);
			await page.getByLabel('Full name').fill('Edited but never saved');

			await page.getByRole('button', { name: DELETE_TRIGGER }).click();
			const dialog = confirmDialog(page);
			await expect(dialog).toHaveAccessibleName(`Delete ${NAME}?`);
			await dialog.getByRole('button', { name: 'Delete olympiad' }).click();

			await expect(page).toHaveURL('/contribute');
			expect(dialogs).toEqual([]);

			// Gone for everyone: the page, the year, deep search and the listing.
			const gone = await page.goto(`/contribute/${OLYMPIAD}`);
			expect(gone?.status()).toBe(404);
			expect((await page.goto(`/contribute/${OLYMPIAD}/${OWNED.nukeYear}`))?.status()).toBe(404);
			expect((await deepSearch(request, NUKE_FILE.phrase)).results).toEqual([]);
			const listing = await request.get('/api/olympiads', {
				headers: { 'cache-control': 'no-cache' }
			});
			expect((await listing.json()).map((o: { id: string }) => o.id)).not.toContain(OLYMPIAD);

			// The assignment went with it: 403, not the 404 an assigned contributor gets.
			expect((await assignee.get(`/contribute/${OLYMPIAD}`)).status()).toBe(403);
		});
	});
});
