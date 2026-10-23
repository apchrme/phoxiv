import type { APIRequestContext } from '@playwright/test';
import { USERS, type UserKey } from '../../fixtures/seed-data';
import { postAction } from '../../support/actions';
import { expect, test } from '../../support/test';

/*
 * Who may reach what. Mirrors docs/auth.md's "Which guard each route uses",
 * row by row; when that table changes, change this file with it.
 *
 * Every refusal checks the message as well as the status, so a 403 from the
 * wrong guard (or SvelteKit's CSRF check) can't pass for the right one.
 *
 * No layout load runs for a form action, so the contribute layout's role check
 * never protects one: each action's own guard is the only check, and each is
 * probed with every role that must be refused.
 *
 * Nothing here writes, even if a guard breaks: forged actions send no fields, or
 * target an olympiad that doesn't exist, so the code past a missing guard
 * refuses them too instead of changing a frozen row.
 */

const UNAUTHORISED = 'Unauthorised';

/** Expects a page or endpoint refusal, with its message in the body. */
async function expectStatus(
	api: APIRequestContext,
	path: string,
	status: number,
	message?: string
): Promise<void> {
	const response = await api.get(path, { maxRedirects: 0 });
	expect(response.status(), path).toBe(status);
	if (message) expect(await response.text(), path).toContain(message);
}

/** Expects a 303 to `location`. */
async function expectRedirect(api: APIRequestContext, path: string, location: string) {
	const response = await api.get(path, { maxRedirects: 0 });
	expect(response.status(), path).toBe(303);
	expect(response.headers().location, path).toBe(location);
}

/** The signed-out visitor and the two signed-in roles below contributor. */
const NOT_ADMIN: (UserKey | null)[] = [null, 'user', 'contributor', 'banned'];

test.describe('access control', { tag: '@smoke' }, () => {
	test('the harness can post an action at all (positive control)', async ({ apiAs }) => {
		// If this fails, every forged-action refusal below is meaningless.
		const admin = await apiAs('admin');
		await postAction(
			admin,
			'/admin?/setRole',
			{ userId: USERS.admin.id, role: 'user' },
			{ failure: 400, message: 'You cannot change your own role' }
		);
	});

	test.describe('admin: requireAdmin on the layout, the load and every action', () => {
		for (const who of NOT_ADMIN) {
			test(`${who ?? 'anonymous'} is refused /admin and its actions`, async ({ apiAs }) => {
				const api = await apiAs(who);
				await expectStatus(api, '/admin', 403, UNAUTHORISED);
				for (const action of [
					'setRole',
					'setAssignedOlympiads',
					'banUser',
					'unbanUser',
					'ensureIndex',
					'optimizeIndex',
					'pruneIndex'
				]) {
					await postAction(
						api,
						`/admin?/${action}`,
						{ userId: USERS.user.id, role: 'admin' },
						{ error: 403, message: UNAUTHORISED }
					);
				}
			});
		}

		test('an admin gets /admin', async ({ apiAs }) => {
			await expectStatus(await apiAs('admin'), '/admin', 200);
		});
	});

	test.describe('admin endpoints: requireAdmin called by each endpoint', () => {
		// A `+server.ts` runs no layout loads, so admin/+layout.server.ts does not
		// protect these (CLAUDE.md, "A +server.ts does not run layout loads").
		for (const who of NOT_ADMIN) {
			test(`${who ?? 'anonymous'} is refused every admin endpoint`, async ({ apiAs }) => {
				const api = await apiAs(who);
				for (const path of ['/admin/reindex', '/admin/index-stats', '/admin/activity']) {
					await expectStatus(api, path, 403, UNAUTHORISED);
				}
				const post = await api.post('/admin/reindex', { data: { results: [] } });
				expect(post.status()).toBe(403);
				expect(await post.text()).toContain(UNAUTHORISED);
			});
		}

		test('an admin reaches every admin endpoint', async ({ apiAs }) => {
			const api = await apiAs('admin');
			for (const path of ['/admin/reindex', '/admin/index-stats', '/admin/activity']) {
				await expectStatus(api, path, 200);
			}
			// An empty batch writes nothing.
			const post = await api.post('/admin/reindex', { data: { results: [] } });
			expect(post.status()).toBe(200);
			expect(await post.json()).toEqual({ written: 0, counts: {}, failed: [] });
		});

		test('the activity endpoint rejects a bad cursor', async ({ apiAs }) => {
			const api = await apiAs('admin');
			for (const before of ['abc', '0', '-1', '1.5']) {
				await expectStatus(api, `/admin/activity?before=${before}`, 400, 'Invalid cursor');
			}
		});
	});

	test.describe('contribute: requireContributor on the layout', () => {
		test('a signed-out visitor is sent to log in, and back afterwards', async ({ apiAs }) => {
			const api = await apiAs(null);
			await expectRedirect(api, '/contribute', '/login?redirect=%2Fcontribute');
			await expectRedirect(
				api,
				'/contribute/e2e-assigned/2018',
				'/login?redirect=%2Fcontribute%2Fe2e-assigned%2F2018'
			);
		});

		test('a plain user is refused', async ({ apiAs }) => {
			const api = await apiAs('user');
			await expectStatus(api, '/contribute', 403, UNAUTHORISED);
			await expectStatus(api, '/contribute/e2e-assigned', 403, UNAUTHORISED);
		});

		test('contributors and admins get in', async ({ apiAs }) => {
			await expectStatus(await apiAs('contributor'), '/contribute', 200);
			await expectStatus(await apiAs('admin'), '/contribute', 200);
		});
	});

	test.describe('contribute: selectYear checks the submitted olympiad', () => {
		for (const who of NOT_ADMIN) {
			test(`${who ?? 'anonymous'} may not jump to an olympiad they can't edit`, async ({
				apiAs
			}) => {
				// The id comes from the form, so the action checks it itself. No year, so
				// even a broken check redirects instead of creating one.
				await postAction(
					await apiAs(who),
					'/contribute?/selectYear',
					{ olympiadId: 'alpha' },
					{ failure: 403, message: 'You are not permitted to edit this olympiad' }
				);
			});
		}

		test('…and may jump to their own (no year: no write)', async ({ apiAs }) => {
			await postAction(
				await apiAs('contributor'),
				'/contribute?/selectYear',
				{ olympiadId: 'e2e-assigned' },
				{ redirect: '/contribute/e2e-assigned' }
			);
		});
	});

	test('contribute: createOlympiad is admin-only', async ({ apiAs }) => {
		for (const who of NOT_ADMIN) {
			// No fields: past a broken guard, validation would refuse it with a 400.
			await postAction(
				await apiAs(who),
				'/contribute?/createOlympiad',
				{},
				{ error: 403, message: UNAUTHORISED }
			);
		}
	});

	test.describe('contribute/[olympiad] and [year]: requireOlympiadEditor', () => {
		test('a contributor reaches only their olympiad', async ({ apiAs }) => {
			const api = await apiAs('contributor');
			await expectStatus(api, '/contribute/e2e-assigned', 200);
			await expectStatus(api, '/contribute/e2e-assigned/2018', 200);
			await expectStatus(api, '/contribute/alpha', 403, UNAUTHORISED);
			await expectStatus(api, '/contribute/alpha/2019', 403, UNAUTHORISED);
		});

		test('permission is checked before existence', async ({ apiAs }) => {
			// A contributor learns nothing about which ids exist.
			await expectStatus(
				await apiAs('contributor'),
				'/contribute/no-such-olympiad',
				403,
				UNAUTHORISED
			);
			// An admin may edit anything, so existence is what decides.
			const admin = await apiAs('admin');
			await expectStatus(admin, '/contribute/no-such-olympiad', 404, 'Olympiad not found');
			await expectStatus(admin, '/contribute/alpha/1999', 404);
		});

		// `e2e-unassigned` doesn't exist and nobody is assigned it. The guard
		// refuses before existence is checked, and past a broken guard every action
		// would find nothing to change.
		for (const who of NOT_ADMIN) {
			test(`${who ?? 'anonymous'} is refused every olympiad and year action`, async ({ apiAs }) => {
				const api = await apiAs(who);
				for (const action of [
					'updateOlympiad',
					'uploadIcon',
					'removeIcon',
					'selectYear',
					'importTitles'
				]) {
					await postAction(
						api,
						`/contribute/e2e-unassigned?/${action}`,
						{},
						{
							error: 403,
							message: UNAUTHORISED
						}
					);
				}
				for (const action of [
					'saveMetadata',
					'deleteYear',
					'uploadFile',
					'deleteFile',
					'moveFile'
				]) {
					await postAction(
						api,
						`/contribute/e2e-unassigned/1999?/${action}`,
						{},
						{
							error: 403,
							message: UNAUTHORISED
						}
					);
				}
			});
		}
	});

	test('contribute/[olympiad]/titles.csv guards itself', async ({ apiAs }) => {
		// The contribute layout doesn't run for a `+server.ts`, so a signed-out
		// visitor gets the endpoint's own 403, not the layout's redirect.
		for (const who of [null, 'user', 'banned'] as const) {
			await expectStatus(
				await apiAs(who),
				'/contribute/e2e-assigned/titles.csv',
				403,
				UNAUTHORISED
			);
		}
		const contributor = await apiAs('contributor');
		await expectStatus(contributor, '/contribute/alpha/titles.csv', 403, UNAUTHORISED);
		const own = await contributor.get('/contribute/e2e-assigned/titles.csv');
		expect(own.status()).toBe(200);
		expect(own.headers()['content-type']).toBe('text/csv; charset=utf-8');
		await expectStatus(await apiAs('admin'), '/contribute/alpha/titles.csv', 200);
	});

	test('login and profile redirect on the session', async ({ apiAs }) => {
		await expectRedirect(await apiAs('user'), '/login', '/profile');
		await expectRedirect(await apiAs(null), '/profile', '/login');
	});

	test('trackProblem needs only a session', async ({ apiAs }) => {
		await postAction(
			await apiAs(null),
			'/olympiads/alpha?/trackProblem',
			{ intent: 'complete', year: '2019', number: 'T1' },
			{ failure: 401, message: 'Sign in to track problems' }
		);
		// Any signed-in user passes the gate; a missing problem is the next check.
		await postAction(
			await apiAs('user'),
			'/olympiads/alpha?/trackProblem',
			{ intent: 'complete', year: '2019' },
			{ failure: 400, message: 'Missing problem' }
		);
	});

	test('the progress endpoints are 401 when signed out', async ({ apiAs }) => {
		const anonymous = await apiAs(null);
		const user = await apiAs('user');
		for (const path of ['/progress', '/olympiads/alpha/progress']) {
			await expectStatus(anonymous, path, 401, 'Not signed in');
			await expectStatus(user, path, 200);
		}
	});

	test('the public API needs no session', async ({ apiAs }) => {
		const api = await apiAs(null);
		for (const path of [
			'/api/olympiads',
			'/api/olympiads/alpha',
			'/api/olympiads/alpha/contributors',
			'/api/search',
			'/api/stats',
			'/api/team'
		]) {
			await expectStatus(api, path, 200);
		}
	});

	test('a user banned by hand in SQL is signed out on every page', async ({ apiAs }) => {
		// USERS.banned has `banned` set and its session kept, as a hand-run UPDATE
		// would leave it. hooks.server.ts: "A banned user is treated as signed out,
		// whatever sessions they still hold."
		const api = await apiAs('banned');
		await expectRedirect(api, '/profile', '/login');
		await expectRedirect(api, '/contribute', '/login?redirect=%2Fcontribute');
		await expectStatus(api, '/progress', 401, 'Not signed in');
		await expectStatus(api, '/contribute/e2e-assigned/titles.csv', 403, UNAUTHORISED);
		// The login page doesn't bounce them to /profile, so no page sees a user.
		await expectStatus(api, '/login', 200);
		await postAction(
			api,
			'/olympiads/alpha?/trackProblem',
			{ intent: 'complete', year: '2019', number: 'T1' },
			{ failure: 401, message: 'Sign in to track problems' }
		);
	});
});
