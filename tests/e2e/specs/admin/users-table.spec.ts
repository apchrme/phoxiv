import type { Locator, Page, Request } from '@playwright/test';
import { USERS, usersTableFiller } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady, holdAction, pickOlympiad, toast } from '../../support/ui';

/*
 * The users table on /admin beyond a single role change (admin/users.spec.ts):
 * its pages, and assigning olympiads to a contributor.
 *
 * Owns USERS.assignTarget and the USERS_TABLE_FILLERS filler accounts
 * (fixtures/seed-data.ts), which give the table a second page. Acts as the
 * frozen USERS.admin and reads the frozen USERS.contributor row. The olympiads
 * assigned are frozen ones: an assignment is written to the user's row, and
 * USERS.assignTarget only opens their editors, which writes nothing.
 */

test.use({ role: 'admin' });

/**
 * The users-table row for `user`, found by an exact match on its email cell.
 * A text filter won't do: seeded emails are substrings of one another
 * (`admin@e2e.test` of `superadmin@e2e.test`).
 */
function userRow(page: Page, user: { email: string }): Locator {
	return page
		.getByRole('row')
		.filter({ has: page.getByRole('cell', { name: user.email, exact: true }) });
}

/** The row's role select: a bits-ui trigger, so a button, named "Role: <shown role>". */
function roleSelect(row: Locator): Locator {
	return row.getByRole('combobox', { name: /^Role: / });
}

/** The pager's "Page N of M", rendered only while there is more than one page. */
function pageLabel(page: Page): Locator {
	return page.getByText(/^Page \d+ of \d+$/);
}

/** From page 1 to page 2 through the pager's Next button. */
async function toPageTwo(page: Page): Promise<void> {
	await expect(pageLabel(page)).toHaveText(/^Page 1 of \d+$/);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(pageLabel(page)).toHaveText(/^Page 2 of \d+$/);
}

/**
 * A filler past the 25 rows of page 1, and far enough from the last filler to
 * stay on page 2 if more accounts are ever seeded ahead of the fillers. The
 * paging test checks it is on page 2, not page 1, before relying on it.
 */
const PAGE_TWO_FILLER = usersTableFiller(20);

test.describe('paging the users table', () => {
	test('changing a role on page 2 keeps the table on page 2', async ({ page }) => {
		// UsersTable.svelte: "TanStack's `autoResetPageIndex` is off because it also
		// fires when an action reloads `users`, which would jump the admin back to
		// page 1 mid-task."
		await gotoReady(page, '/admin');
		const row = userRow(page, PAGE_TWO_FILLER);
		await expect(row).toHaveCount(0);
		await toPageTwo(page);
		await expect(row).toBeVisible();

		await roleSelect(row).click();
		await page.getByRole('option', { name: 'Contributor', exact: true }).click();
		await expect(roleSelect(row)).toHaveAccessibleName('Role: Contributor');
		await row.getByRole('button', { name: 'Save' }).click();
		await expect(toast(page, 'Role updated')).toBeVisible();

		// The reload has landed: only a stored contributor gets the olympiad picker,
		// and the draft that showed "Contributor" before the save is gone by now.
		await expect(
			row.getByRole('button', { name: 'Assigned olympiads', exact: true })
		).toBeVisible();
		await expect(roleSelect(row)).toHaveAccessibleName('Role: Contributor');
		await expect(pageLabel(page)).toHaveText(/^Page 2 of \d+$/);
	});

	// "Back to page 1, called by search, role filter and sorting" (UsersTable.svelte,
	// `toFirstPage`). With `autoResetPageIndex` off, nothing else resets the page,
	// so a narrowed table would otherwise open on a page that may not exist.

	test('searching goes back to page 1', async ({ page }) => {
		await gotoReady(page, '/admin');
		await toPageTwo(page);

		// Matches the fillers alone: 30 of them, two pages of 25. So a search that
		// kept the page index would show "Page 2 of 2", not an empty table.
		await page.getByPlaceholder('Search users…').fill('e2e-ut-filler-');
		await expect(pageLabel(page)).toHaveText('Page 1 of 2');
		await expect(userRow(page, usersTableFiller(1))).toBeVisible();
	});

	test('the role filter goes back to page 1', async ({ page }) => {
		await gotoReady(page, '/admin');
		await toPageTwo(page);

		// A bits-ui select, so a combobox, named "Show: <filter>" by UsersTable.svelte.
		const filter = page.getByRole('combobox', { name: /^Show: / });
		await expect(filter).toHaveAccessibleName('Show: All users');
		await filter.click();
		await page.getByRole('option', { name: 'Contributors only', exact: true }).click();
		await expect(filter).toHaveAccessibleName('Show: Contributors');

		// USERS.contributor joined with the first accounts, so it is on the filtered
		// table's page 1 however many contributors there are, and never on page 2.
		await expect(userRow(page, USERS.contributor)).toBeVisible();
	});

	test('sorting goes back to page 1', async ({ page }) => {
		await gotoReady(page, '/admin');
		await toPageTwo(page);

		await page.getByRole('columnheader', { name: 'User', exact: true }).click();
		await expect(pageLabel(page)).toHaveText(/^Page 1 of \d+$/);
	});
});

/** True for the assignment form's POST, `/admin?/setAssignedOlympiads`. */
function isSetAssigned(url: string): boolean {
	const { pathname, search } = new URL(url);
	return pathname === '/admin' && search === '?/setAssignedOlympiads';
}

/**
 * Opens `/contribute/<id>` and expects `status`: 200 shows the olympiad's editor
 * under `name`, 403 the guard's "Unauthorised" (`requireOlympiadEditor`).
 */
async function expectEditor(page: Page, id: string, status: 200 | 403, name = ''): Promise<void> {
	const response = await page.goto(`/contribute/${id}`);
	expect(response?.status(), id).toBe(status);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		status === 200 ? name : 'Error 403: Unauthorised'
	);
}

test.describe('assigning olympiads to a contributor', () => {
	test('one POST with the picked ids, a busy Save, a toast, and access to exactly those', async ({
		page,
		as
	}) => {
		// Seeded with alpha alone.
		const before = await as('assignTarget');
		await expectEditor(before, 'alpha', 200, 'Alpha Physics Olympiad');
		await expectEditor(before, 'beta', 403);

		const posts: Request[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST' && isSetAssigned(request.url())) posts.push(request);
		});

		await gotoReady(page, '/admin');
		await page.getByPlaceholder('Search users…').fill(USERS.assignTarget.email);
		const row = userRow(page, USERS.assignTarget);
		await expect(row).toHaveCount(1);

		// The row has two Save buttons; this one shares a form with the picker. The
		// picker's panel is portalled out of the form, so what it submits is the
		// hidden inputs it renders in place (OlympiadPicker.svelte).
		const pickerName = { name: 'Assigned olympiads', exact: true };
		const picker = row.getByRole('button', pickerName);
		// `has` is resolved inside each form, so it takes a page-level locator.
		const form = row.locator('form').filter({ has: page.getByRole('button', pickerName) });
		const save = form.getByRole('button', { name: 'Save' });
		await expect(picker).toContainText('Alpha Physics Olympiad');
		await expect(save).toBeDisabled();

		// Picked against display order (beta comes before delta), so the order
		// submitted shows which one the picker keeps. Picking alpha again unpicks it:
		// a multiple-mode picker toggles.
		await pickOlympiad(page, picker, [
			'Delta Physics Olympiad',
			'Beta Physics Olympiad',
			'Alpha Physics Olympiad'
		]);
		await expect(picker).toHaveText('2 olympiads');
		await expect(save).toBeEnabled();

		// While the request is out, this Save shows its spinner and is disabled. The
		// role form's Save is tracked under another key, so it stays at rest.
		const release = await holdAction(page, '/admin', 'setAssignedOlympiads');
		await save.click();
		await expect(form.getByRole('button', { name: 'Loading Save' })).toBeDisabled();
		await expect(row.getByRole('button', { name: 'Loading Save' })).toHaveCount(1);
		release();

		const saved = toast(page, 'Assignments saved');
		await expect(saved).toHaveCount(1);
		// The reload has landed: with the draft dropped, the picker reads the stored
		// list, and Save is disabled because nothing differs from it.
		await expect(picker).toHaveText('2 olympiads');
		await expect(save).toBeDisabled();

		// UserRowActions.svelte drives the picker one-way ("Same pattern") for the
		// reason it does the role select: "the post-submit reload re-fires
		// `onValueChange`, causing an infinite submit loop". Bound and auto-submitted,
		// the picker would loop the same way.
		// eslint-disable-next-line playwright/no-wait-for-timeout -- UserRowActions.svelte: "the post-submit reload re-fires `onValueChange`, causing an infinite submit loop"
		await page.waitForTimeout(1000);
		expect(posts, 'setAssignedOlympiads POSTs sent by the page').toHaveLength(1);
		await expect(saved).toHaveCount(1);

		// One field per olympiad, and the target's id. OlympiadPicker.svelte: "Rebuilt
		// from `olympiads`, not appended, so the stored order is display order rather
		// than click order."
		const body = new URLSearchParams(posts[0].postData() ?? '');
		expect(body.get('userId')).toBe(USERS.assignTarget.id);
		expect(body.getAll('olympiadId')).toEqual(['beta', 'delta']);

		// The same session, in a fresh context. The guard reads the user row on
		// every request, so the change applies at once. Alpha is refused: the save
		// replaced the list rather than adding to it. delta-w is refused: ids match
		// exactly, and "delta" is only a prefix of it.
		const after = await as('assignTarget');
		await expectEditor(after, 'beta', 200, 'Beta Physics Olympiad');
		await expectEditor(after, 'delta', 200, 'Delta Physics Olympiad');
		await expectEditor(after, 'alpha', 403);
		await expectEditor(after, 'delta-w', 403);
	});
});
