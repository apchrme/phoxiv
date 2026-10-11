import { USERS } from '../../fixtures/seed-data';
import { BASE_URL } from '../../support/env';
import { expect, test } from '../../support/test';

/*
 * Bans, and the two gaps src/routes/api/auth/[...all]/+server.ts closes:
 * BetterAuth's admin endpoints, and a banned user's session on `/api/auth/*`.
 *
 * Owns USERS.apiTarget, USERS.banTarget and USERS.unbanTarget. Reads the frozen
 * USERS.banned and USERS.admin without writing them.
 */

test.describe("BetterAuth's admin endpoints", { tag: '@smoke' }, () => {
	test('are closed, even to an admin', async ({ apiAs }) => {
		// "Through `set-role` an admin could demote the superadmin" (+server.ts).
		// Every admin action goes through the admin panel's form actions instead.
		const admin = await apiAs('admin');
		const body = { userId: USERS.apiTarget.id, role: 'admin', banReason: 'x' };
		for (const path of [
			'/api/auth/admin/set-role',
			'/api/auth/admin/ban-user',
			'/api/auth/admin/unban-user',
			'/api/auth/admin/impersonate-user',
			'/api/auth/admin/remove-user',
			// The check is on a prefix, so an endpoint added by an upgrade is closed too.
			'/api/auth/admin/not-an-endpoint-yet',
			// Spellings BetterAuth's router might still resolve.
			'/api/auth//admin/set-role',
			'/api/auth/Admin/set-role'
		]) {
			const response = await admin.post(path, { headers: { origin: BASE_URL }, data: body });
			expect(response.status(), path).toBe(404);
			expect(await response.text(), path).toContain('Not found');
		}

		const list = await admin.get('/api/auth/admin/list-users');
		expect(list.status()).toBe(404);
	});

	test('leave the rest of /api/auth open', async ({ apiAs }) => {
		const response = await (await apiAs('admin')).get('/api/auth/get-session');
		expect(response.status()).toBe(200);
		expect((await response.json())?.user?.id).toBe(USERS.admin.id);
	});
});

test.describe('a user banned by hand in SQL, on /api/auth', { tag: '@smoke' }, () => {
	// USERS.banned has `banned` set and its session kept. hooks.server.ts signs
	// such a user out of every page; /api/auth/* must agree.

	test('gets no session', async ({ apiAs }) => {
		const response = await (await apiAs('banned')).get('/api/auth/get-session');
		expect(response.status()).toBe(200);
		expect(await response.json()).toBeNull();
	});

	test('cannot update their account', async ({ apiAs }) => {
		// The same name, so nothing would change even if the request got through.
		const response = await (
			await apiAs('banned')
		).post('/api/auth/update-user', {
			headers: { origin: BASE_URL },
			data: { name: USERS.banned.name }
		});
		expect(response.status()).toBe(401);
	});
});
