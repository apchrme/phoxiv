import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';
import { answerDialogs, confirmDialog, gotoReady, toast } from '../../support/ui';

/*
 * The admin announcement editor (src/routes/admin/announcements/).
 *
 * Announcements are global: each one here shows in every other spec's bell. So
 * every announcement is per-test, deleted at the end, and tests run one at a
 * time, which keeps pages/notifications.spec.ts's seeded ones in the bell's
 * newest five.
 */

const NEW = '/admin/announcements/new';

test.describe('the announcement editor', () => {
	test.use({ role: 'admin' });

	test('posts, edits and deletes an announcement, logging each', async ({ page, as }) => {
		const title = 'E2E Posted Notice';
		await gotoReady(page, NEW);
		await page.getByLabel('Title').fill(title);
		await page.getByLabel('Body').fill('Now with *emphasis*.');
		await page.getByRole('button', { name: 'Post announcement' }).click();
		await expect(toast(page, 'Announcement posted.')).toBeVisible();
		// A new announcement moves to its own URL.
		await expect(page).toHaveURL(/\/admin\/announcements\/\d+$/);
		const path = new URL(page.url()).pathname;

		// It is public straight away, Markdown rendered.
		const visitor = await as(null);
		await gotoReady(visitor, '/announcements');
		await expect(visitor.getByRole('article', { name: title }).locator('em')).toHaveText(
			'emphasis'
		);

		await page.getByLabel('Title').fill(`${title} (edited)`);
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(toast(page, 'Announcement saved.')).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${title} (edited)`);

		await gotoReady(page, '/admin/announcements');
		await expect(
			page.getByRole('list', { name: 'Announcements' }).getByText(`${title} (edited)`)
		).toBeVisible();

		await gotoReady(page, path);
		await page.getByRole('button', { name: 'Delete announcement' }).click();
		await confirmDialog(page).getByRole('button', { name: 'Delete announcement' }).click();
		await expect(page).toHaveURL('/admin/announcements');
		await expect(page.getByText(`${title} (edited)`)).toHaveCount(0);

		await gotoReady(page, '/admin/log');
		for (const label of ['Created announcement', 'Updated announcement', 'Deleted announcement']) {
			await expect(page.getByText(label).first()).toBeVisible();
		}
	});

	test('a refused save keeps what was typed', async ({ page }) => {
		await gotoReady(page, NEW);
		await page.getByLabel('Title').fill('E2E Refused Notice');
		// The browser's own `required` check would stop an empty body, so the
		// refusal comes from the server's length check instead.
		await page.getByLabel('Body').evaluate((el: HTMLTextAreaElement) => {
			el.removeAttribute('maxlength');
		});
		await page.getByLabel('Body').fill('x'.repeat(10001));
		await page.getByRole('button', { name: 'Post announcement' }).click();
		await expect(toast(page, 'Body must be at most 10000 characters')).toBeVisible();
		await expect(page.getByLabel('Title')).toHaveValue('E2E Refused Notice');
		await expect(page).toHaveURL(NEW);
	});

	test('after posting, leaving with an edit still asks', async ({ page, apiAs }) => {
		const dialogs = answerDialogs(page, false);
		await gotoReady(page, NEW);
		await page.getByLabel('Title').fill('E2E Unsaved Notice');
		await page.getByLabel('Body').fill('Body.');
		await page.getByRole('button', { name: 'Post announcement' }).click();
		await expect(toast(page, 'Announcement posted.')).toBeVisible();
		await expect(page).toHaveURL(/\/admin\/announcements\/\d+$/);
		const path = new URL(page.url()).pathname;

		await page.getByLabel('Title').fill('E2E Unsaved Notice, changed');
		await page.getByRole('link', { name: 'Announcements', exact: true }).click();
		await expect.poll(() => dialogs.length).toBeGreaterThan(0);
		await expect(page).toHaveURL(path);

		await postAction(
			await apiAs('admin'),
			`${path}?/delete`,
			{},
			{ redirect: '/admin/announcements' }
		);
	});

	test('bad input is refused with a reason', async ({ apiAs }) => {
		const admin = await apiAs('admin');
		const cases: [Record<string, string>, string][] = [
			[{ title: '', body: 'Body.' }, 'Title is required'],
			[{ title: '   ', body: 'Body.' }, 'Title is required'],
			[{ title: 'x'.repeat(201), body: 'Body.' }, 'Title must be at most 200 characters'],
			[{ title: 'E2E Bad', body: '' }, 'Body is required'],
			[{ title: 'E2E Bad', body: 'x'.repeat(10001) }, 'Body must be at most 10000 characters']
		];
		for (const [fields, message] of cases) {
			await postAction(admin, `${NEW}?/save`, fields, { failure: 400, message });
		}
		await postAction(
			admin,
			'/admin/announcements/999999999?/save',
			{ title: 'E2E Ghost', body: 'Body.' },
			{ failure: 404, message: 'Announcement not found' }
		);
		await postAction(
			admin,
			'/admin/announcements/999999999?/delete',
			{},
			{ failure: 404, message: 'Announcement not found' }
		);
	});

	test('a script in the body is stripped before it is stored', async ({ apiAs }) => {
		const admin = await apiAs('admin');
		const created = await postAction(
			admin,
			`${NEW}?/save`,
			{ title: 'E2E Script Notice', body: 'Hi <script>alert(1)</script><b>there</b>' },
			{ success: true }
		);
		const id = created.data?.id as number;
		const page = await (await apiAs(null)).get('/announcements');
		const html = await page.text();
		expect(html).toContain('<b>there</b>');
		expect(html).not.toContain('<script>alert(1)</script>');

		await postAction(
			admin,
			`/admin/announcements/${id}?/delete`,
			{},
			{ redirect: '/admin/announcements' }
		);
	});
});
