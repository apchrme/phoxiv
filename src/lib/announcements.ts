/*
 * Announcement types and limits shared by the server (the admin editor, the
 * `/notifications` endpoint) and the browser (the navbar bell). See
 * docs/architecture.md, "Announcements and the bell".
 */

/** Longest title the editor accepts; the bell shows it on one or two lines. */
export const ANNOUNCEMENT_TITLE_MAX = 200;

/** Longest Markdown body the editor accepts. A sanity bound, not a design limit. */
export const ANNOUNCEMENT_BODY_MAX = 10000;

/** How many of the newest announcements the bell lists; the rest are on /announcements. */
export const BELL_LIMIT = 5;

/**
 * Most ids one `POST /notifications` may mark as seen. Keeps the existence
 * check to one `IN (…)` under D1's 100 bound parameters.
 */
export const MARK_READ_MAX = 100;

/** One announcement as the public sees it. `bodyHtml` is already sanitised. */
export type Announcement = {
	id: number;
	title: string;
	bodyHtml: string;
	/** Epoch milliseconds, so the shape survives `Response.json`. */
	createdAt: number;
};

/**
 * `GET /notifications`. `read` is `null` when signed out: the browser then
 * keeps the seen set itself, in localStorage.
 */
export type NotificationsPayload = {
	announcements: Announcement[];
	read: number[] | null;
};
