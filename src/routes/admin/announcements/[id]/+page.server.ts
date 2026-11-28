import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { announcements } from '#lib/server/db/index.js';
import { requireAdmin } from '#lib/server/guard.js';
import { logActivity } from '#lib/server/activity-log.js';
import { renderMarkdown } from '#lib/server/markdown.js';
import { getAnnouncement } from '#lib/server/db/queries/announcements.js';
import { actionFail, field, ok, parseRouteId, type Validated } from '#lib/server/forms.js';
import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from '#lib/announcements.js';

/**
 * The announcement editor. `/admin/announcements/new` creates one;
 * `/admin/announcements/<id>` edits it. Its writes happen only here, so they
 * stay inline rather than in `queries/announcements.ts`.
 *
 * The admin layout guards the load, but each action calls `requireAdmin` again:
 * a forged POST never runs the layout (docs/auth.md).
 */

export const load: PageServerLoad = async ({ params, locals }) => {
	const { db } = requireAdmin(locals);
	const id = parseRouteId(params.id);
	if (id === 'invalid') error(404, 'Announcement not found');

	const announcement = id === null ? null : await getAnnouncement(db, id);
	if (id !== null && !announcement) error(404, 'Announcement not found');

	return { announcement: announcement ?? null };
};

/** The form's fields, checked. */
function parseAnnouncementForm(data: FormData): Validated<{ title: string; bodyMd: string }> {
	const title = field(data, 'title');
	if (!title) return { ok: false, error: 'Title is required' };
	if (title.length > ANNOUNCEMENT_TITLE_MAX) {
		return { ok: false, error: `Title must be at most ${ANNOUNCEMENT_TITLE_MAX} characters` };
	}
	const bodyMd = field(data, 'body');
	if (!bodyMd) return { ok: false, error: 'Body is required' };
	if (bodyMd.length > ANNOUNCEMENT_BODY_MAX) {
		return { ok: false, error: `Body must be at most ${ANNOUNCEMENT_BODY_MAX} characters` };
	}
	return { ok: true, value: { title, bodyMd } };
}

export const actions: Actions = {
	/**
	 * Creates or updates the announcement. An edit keeps the id, so it doesn't
	 * reappear as unread for anyone who has already seen it.
	 */
	save: async ({ request, params, locals }) => {
		const { db, user: actor } = requireAdmin(locals);
		const id = parseRouteId(params.id);
		if (id === 'invalid') return actionFail(404, 'save', 'Announcement not found');

		const parsed = parseAnnouncementForm(await request.formData());
		if (!parsed.ok) return actionFail(400, 'save', parsed.error);
		const { title, bodyMd } = parsed.value;
		const bodyHtml = await renderMarkdown(bodyMd);

		let savedId: number;
		if (id === null) {
			const row = await db
				.insert(announcements)
				.values({ title, bodyMd, bodyHtml, createdBy: actor.id })
				.returning({ id: announcements.id })
				.get();
			savedId = row.id;
		} else {
			const row = await db
				.update(announcements)
				.set({ title, bodyMd, bodyHtml })
				.where(eq(announcements.id, id))
				.returning({ id: announcements.id })
				.get();
			if (!row) return actionFail(404, 'save', 'Announcement not found');
			savedId = row.id;
		}
		await logActivity(
			db,
			actor,
			id === null ? 'create_announcement' : 'update_announcement',
			title
		);

		return ok('save', { id: savedId, created: id === null });
	},

	/** Deletes the announcement; everyone's seen rows for it cascade. */
	delete: async ({ params, locals }) => {
		const { db, user: actor } = requireAdmin(locals);
		const id = parseRouteId(params.id);
		if (id === 'invalid') return actionFail(404, 'delete', 'Announcement not found');
		if (id === null) return actionFail(400, 'delete', 'Nothing to delete');

		const removed = await db
			.delete(announcements)
			.where(eq(announcements.id, id))
			.returning({ title: announcements.title })
			.get();
		if (!removed) return actionFail(404, 'delete', 'Announcement not found');
		await logActivity(db, actor, 'delete_announcement', removed.title);

		redirect(303, '/admin/announcements');
	}
};
