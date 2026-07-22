import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { eq, ne, asc } from 'drizzle-orm';
import { user, olympiads } from '$lib/server/db/schema.js';
import { requireAdmin } from '$lib/server/guard.js';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	const users = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			role: user.role,
			banned: user.banned,
			banReason: user.banReason,
			createdAt: user.createdAt,
			assignedOlympiads: user.assignedOlympiads
		})
		.from(user)
		.orderBy(user.createdAt)
		.all();

	const olympiadOptions = await db
		.select({ id: olympiads.id, name: olympiads.name })
		.from(olympiads)
		.orderBy(asc(olympiads.displayOrder), asc(olympiads.id))
		.all();

	return { users, olympiads: olympiadOptions };
};

export const actions: Actions = {
	setRole: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const db = locals.db;
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '').trim();
		const role = String(data.get('role') ?? '').trim();

		if (!userId) return fail(400, { error: 'User ID required' });

		// Prevent an admin from demoting themselves
		if (userId === locals.user!.id) {
			return fail(400, { error: 'You cannot change your own role' });
		}

		// prevent modifying superadmin
		const superadminEmail = platform?.env.SUPERADMIN_EMAIL;
		const target = await db
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, userId))
			.get();
		if (superadminEmail && target?.email === superadminEmail) {
			return fail(403, { error: 'This account cannot be modified' });
		}

		const validRoles = ['admin', 'contributor', 'user', ''];
		if (!validRoles.includes(role)) return fail(400, { error: 'Invalid role' });

		await db
			.update(user)
			.set({ role: role || null })
			.where(eq(user.id, userId))
			.run();

		return { success: true };
	},

	// New: admins assign which olympiads a contributor may edit.
	setAssignedOlympiads: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '').trim();
		const olympiadIds = data.getAll('olympiadId').map(String);

		if (!userId) return fail(400, { error: 'User ID required' });
		if (userId === locals.user!.id) {
			return fail(400, { error: 'You cannot change your own assignments' });
		}

		await db
			.update(user)
			.set({ assignedOlympiads: JSON.stringify(olympiadIds) })
			.where(eq(user.id, userId))
			.run();

		return { success: true };
	},

	banUser: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const db = locals.db;
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '').trim();
		const reason = String(data.get('reason') ?? '').trim() || null;

		if (!userId) return fail(400, { error: 'User ID required' });
		if (userId === locals.user!.id) return fail(400, { error: 'You cannot ban yourself' });

		// prevent modifying superadmin
		const superadminEmail = platform?.env.SUPERADMIN_EMAIL;
		const target = await db
			.select({ email: user.email })
			.from(user)
			.where(eq(user.id, userId))
			.get();
		if (superadminEmail && target?.email === superadminEmail) {
			return fail(403, { error: 'This account cannot be modified' });
		}

		await db.update(user).set({ banned: true, banReason: reason }).where(eq(user.id, userId)).run();

		return { success: true };
	},

	unbanUser: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const data = await request.formData();
		const userId = String(data.get('userId') ?? '').trim();

		if (!userId) return fail(400, { error: 'User ID required' });

		await db.update(user).set({ banned: false, banReason: null }).where(eq(user.id, userId)).run();

		return { success: true };
	}
};