import { and, desc, eq, inArray } from 'drizzle-orm';
import { announcementReads, announcements, user, type DB } from '../index';
import type { Announcement } from '#lib/announcements.js';

/*
 * Reads shared by the bell (`/notifications`), `/announcements` and the admin
 * list, and the one write with rules of its own: marking announcements seen.
 * The admin editor's insert, update and delete stay inline in its actions.
 *
 * Read budget: the bell fetches on every full page load, so `listAnnouncements`
 * with a limit and `listReadIds` must stay one indexed query each.
 */

/** Newest first. `limit` is the bell's; `/announcements` passes none. */
export async function listAnnouncements(
	db: DB,
	{ limit }: { limit?: number } = {}
): Promise<Announcement[]> {
	const query = db
		.select({
			id: announcements.id,
			title: announcements.title,
			bodyHtml: announcements.bodyHtml,
			createdAt: announcements.createdAt
		})
		.from(announcements)
		.orderBy(desc(announcements.id));
	const rows = await (limit === undefined ? query.all() : query.limit(limit).all());
	return rows.map((r) => ({ ...r, createdAt: r.createdAt.getTime() }));
}

/** The admin list: every announcement with its author's name, newest first. */
export async function listAnnouncementsForAdmin(db: DB) {
	return db
		.select({
			id: announcements.id,
			title: announcements.title,
			createdAt: announcements.createdAt,
			updatedAt: announcements.updatedAt,
			authorName: user.name
		})
		.from(announcements)
		.leftJoin(user, eq(user.id, announcements.createdBy))
		.orderBy(desc(announcements.id))
		.all();
}

/** One announcement with its Markdown source, for the editor. */
export async function getAnnouncement(db: DB, id: number) {
	return db
		.select({
			id: announcements.id,
			title: announcements.title,
			bodyMd: announcements.bodyMd
		})
		.from(announcements)
		.where(eq(announcements.id, id))
		.get();
}

/**
 * Which of `ids` the user has seen. Served by the unique (user, announcement)
 * index. `ids` must be at most ~90 long (D1 caps bound parameters at 100).
 */
export async function listReadIds(db: DB, userId: string, ids: number[]): Promise<number[]> {
	if (ids.length === 0) return [];
	const rows = await db
		.select({ id: announcementReads.announcementId })
		.from(announcementReads)
		.where(
			and(eq(announcementReads.userId, userId), inArray(announcementReads.announcementId, ids))
		)
		.all();
	return rows.map((r) => r.id);
}

/** Every announcement the user has seen, for `/announcements`, which lists them all. */
export async function listAllReadIds(db: DB, userId: string): Promise<number[]> {
	const rows = await db
		.select({ id: announcementReads.announcementId })
		.from(announcementReads)
		.where(eq(announcementReads.userId, userId))
		.all();
	return rows.map((r) => r.id);
}

/** Two bound parameters per row (`read_at` takes its default), so 40 rows stay under 100. */
const INSERT_CHUNK = 40;

/**
 * Marks `ids` seen for the user. Idempotent. Ids that don't name an
 * announcement are dropped first: D1 enforces foreign keys, and a sign-in merge
 * can carry ids of announcements deleted since the browser saw them. Callers
 * cap `ids` at `MARK_READ_MAX` so the existence check is one statement.
 */
export async function markAnnouncementsRead(db: DB, userId: string, ids: number[]): Promise<void> {
	const unique = [...new Set(ids)];
	if (unique.length === 0) return;
	const existing = await db
		.select({ id: announcements.id })
		.from(announcements)
		.where(inArray(announcements.id, unique))
		.all();
	for (let i = 0; i < existing.length; i += INSERT_CHUNK) {
		await db
			.insert(announcementReads)
			.values(existing.slice(i, i + INSERT_CHUNK).map((a) => ({ userId, announcementId: a.id })))
			.onConflictDoNothing()
			.run();
	}
}
