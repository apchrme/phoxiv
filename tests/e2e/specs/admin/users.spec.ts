import type { Locator, Page, Request } from '@playwright/test';
import { USERS } from '../../fixtures/seed-data';
import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';
import { gotoReady, holdAction, toast } from '../../support/ui';

/*
 * The users table on /admin: changing a role, and what `setRole` refuses.
 *
 * Owns USERS.roleTarget and USERS.loopTarget. Acts as the frozen USERS.admin, and
 * reads the frozen USERS.user and USERS.superadmin rows without writing them.
 */

test.use({ role: 'admin' });

/**
 * The users-table row for `user`, found by an exact match on its email cell.
 * A text filter won't do: `admin@e2e.test` is the tail of `superadmin@e2e.test`.
 * Every `USERS` account is on the table's first page: the users-table fillers
 * joined later, so the default oldest-first sort puts them after (docs/testing.md).
 */
function userRow(page: Page, user: { email: string }): Locator {
	return page
		.getByRole('row')
		.filter({ has: page.getByRole('cell', { name: user.email, exact: true }) });
}

/**
 * The row's role select: a bits-ui trigger, so a button, named "Role: <shown
 * role>" by UserRowActions.svelte. Its text is the role alone.
 */
function roleSelect(row: Locator): Locator {
	return row.getByRole('button', { name: /^Role: / });
}

/**
 * Picks `label` in the row's role select. The options are portalled, so they
 * are found from `page`.
 */
async function chooseRole(page: Page, row: Locator, label: string): Promise<void> {
	await roleSelect(row).click();
	await page.getByRole('option', { name: label, exact: true }).click();
	await expect(roleSelect(row)).toHaveText(label);
}

/** True for the role form's POST, `/admin?/setRole`. */
function isSetRole(url: URL | string): boolean {
	const { pathname, search } = new URL(url);
	return pathname === '/admin' && search === '?/setRole';
}

test.describe('changing a role in the users table', () => {
	test('sends one POST and raises one toast, with no resubmit afterwards', async ({ page }) => {
		// UserRowActions.svelte: "the post-submit reload re-fires `onValueChange`,
		// causing an infinite submit loop". The fix is a draft plus Save, so the
		// select never submits by itself; this counts what the page actually sends.
		const posts: Request[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST' && isSetRole(request.url())) posts.push(request);
		});

		await gotoReady(page, '/admin');
		const row = userRow(page, USERS.loopTarget);
		await chooseRole(page, row, 'Contributor');
		await row.getByRole('button', { name: 'Save' }).click();

		const updated = toast(page, 'Role updated');
		await expect(updated).toHaveCount(1);
		// The reload has landed: the row reads the stored role, and as a
		// contributor it now has the olympiad picker.
		await expect(roleSelect(row)).toHaveText('Contributor');
		await expect(roleSelect(row)).toHaveAccessibleName('Role: Contributor');
		await expect(row.getByRole('button', { name: 'Assigned olympiads' })).toBeVisible();

		// `use:enhance` reloads the data before it sets `form`, so by the time the
		// toast shows, a looping select would already have fired again.
		// eslint-disable-next-line playwright/no-wait-for-timeout -- UserRowActions.svelte: "the post-submit reload re-fires `onValueChange`, causing an infinite submit loop"
		await page.waitForTimeout(1000);
		expect(posts, 'setRole POSTs sent by the page').toHaveLength(1);
		await expect(updated).toHaveCount(1);
	});

	test("reaches the target's next request", async ({ page, as }) => {
		// Before: a plain user is refused /contribute.
		const before = await as('roleTarget');
		const refused = await before.goto('/contribute');
		expect(refused?.status()).toBe(403);
		await expect(before.getByRole('heading', { level: 1 })).toHaveText('Error 403: Unauthorised');

		await gotoReady(page, '/admin');
		const row = userRow(page, USERS.roleTarget);
		await chooseRole(page, row, 'Contributor');
		// While the request is out, Save shows its spinner and both controls are
		// disabled, so a second click can't send a second POST.
		const release = await holdAction(page, '/admin', 'setRole');
		await row.getByRole('button', { name: 'Save' }).click();
		await expect(row.getByRole('button', { name: 'Loading Save' })).toBeDisabled();
		await expect(roleSelect(row)).toBeDisabled();
		release();
		await expect(toast(page, 'Role updated')).toBeVisible();

		// The same session, unchanged, now passes the contributor guard: BetterAuth
		// reads the user row with the session on every request (no cookie cache is
		// configured), so no sign-in is needed. A fresh context, because a role
		// change is one of the cases docs/testing.md says needs one.
		const after = await as('roleTarget');
		const allowed = await after.goto('/contribute');
		expect(allowed?.status()).toBe(200);
		await expect(after.getByRole('heading', { level: 1, name: 'Contribute' })).toBeVisible();
	});
});

test("the admin's own row has no role, assignment or ban controls", async ({ page }) => {
	// UsersTable.svelte renders no `UserRowActions` for the acting admin; the
	// actions refuse a self-change anyway (auth/access-control's positive control).
	await gotoReady(page, '/admin');

	// A positive control, so the empty row below can't pass because nothing in
	// the table rendered: another user's row has every control.
	const other = userRow(page, USERS.user);
	await expect(roleSelect(other)).toBeVisible();
	await expect(other.getByRole('button', { name: 'Save' })).toBeVisible();
	await expect(other.getByRole('button', { name: 'Ban', exact: true })).toBeVisible();

	const own = userRow(page, USERS.admin);
	await expect(own.getByText('You', { exact: true })).toBeVisible();
	await expect(roleSelect(own)).toHaveCount(0);
	await expect(own.getByRole('button')).toHaveCount(0);
});

test.describe('setRole refusals', () => {
	test('the superadmin and an invalid role, forged', { tag: '@smoke' }, async ({ request }) => {
		// The role sent is the superadmin's own, so even past a broken check the
		// frozen row would not change.
		await postAction(
			request,
			'/admin?/setRole',
			{ userId: USERS.superadmin.id, role: USERS.superadmin.role },
			{ failure: 403, message: 'This account cannot be modified' }
		);

		// The dropdown offers only `user`, `contributor` and `admin`. A label instead
		// of a value is refused too: the check is exact. Past a broken check, only
		// the owned USERS.loopTarget would change.
		for (const role of ['owner', 'Admin']) {
			await postAction(
				request,
				'/admin?/setRole',
				{ userId: USERS.loopTarget.id, role },
				{ failure: 400, message: 'Invalid role' }
			);
		}
	});

	test('the superadmin row offers a role change and toasts the refusal', async ({ page }) => {
		// The UI shows controls on the superadmin's row, so the refusal must reach
		// the admin as a toast. Save is enabled only for a role other than the stored
		// one, which a broken check would write to this frozen row. So the request
		// is sent with the stored role instead: the refusal comes before any write,
		// and it doesn't depend on the role.
		await page.route(isSetRole, async (route) => {
			const body = new URLSearchParams(route.request().postData() ?? '');
			body.set('role', USERS.superadmin.role);
			await route.continue({ postData: body.toString() });
		});

		await gotoReady(page, '/admin');
		const row = userRow(page, USERS.superadmin);
		await chooseRole(page, row, 'Contributor');
		await row.getByRole('button', { name: 'Save' }).click();

		const refused = toast(page, 'This account cannot be modified');
		await expect(refused).toBeVisible();
		await expect(refused).toHaveAttribute('data-type', 'error');
		// The draft is dropped, so the select shows the stored role again.
		await expect(roleSelect(row)).toHaveText('Admin');
	});
});
