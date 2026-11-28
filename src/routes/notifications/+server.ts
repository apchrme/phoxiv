import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setNoStore } from '#lib/server/cache.js';
import {
	listAnnouncements,
	listReadIds,
	markAnnouncementsRead
} from '#lib/server/db/queries/announcements.js';
import { BELL_LIMIT, MARK_READ_MAX, type NotificationsPayload } from '#lib/announcements.js';

/**
 * The navbar bell: the newest announcements, and which of them the signed-in
 * user has seen.
 *
 * Unlike `/progress`, a signed-out GET is answered rather than refused, since
 * signed-out visitors see announcements too. They get `read: null` and keep
 * their seen set in localStorage (#lib/notifications.svelte.ts).
 *
 * Outside `/api/` because the answer depends on who asks, and the shared cache
 * would serve one user's read state to everyone. The only input is
 * `locals.user.id`. Never add a user id parameter.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setNoStore(setHeaders);

	const announcements = await listAnnouncements(locals.db, { limit: BELL_LIMIT });
	const read = locals.user
		? await listReadIds(
				locals.db,
				locals.user.id,
				announcements.map((a) => a.id)
			)
		: null;
	return Response.json({ announcements, read } satisfies NotificationsPayload);
};

/**
 * Marks announcements seen: `{ ids: number[] }`, from opening the bell, visiting
 * /announcements, or merging a signed-out browser's seen set at sign-in.
 *
 * JSON only. SvelteKit's CSRF check covers form content types, and a
 * cross-origin `application/json` POST needs a CORS preflight, which this
 * endpoint never answers.
 */
export const POST: RequestHandler = async ({ locals, request, setHeaders }) => {
	// Before the guard, so a 401 is uncached too.
	setNoStore(setHeaders);

	if (!locals.user) error(401, 'Not signed in');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected a JSON body');
	}
	const ids = (body as { ids?: unknown } | null)?.ids;
	if (
		!Array.isArray(ids) ||
		ids.length === 0 ||
		ids.length > MARK_READ_MAX ||
		!ids.every((id) => Number.isInteger(id) && id > 0)
	) {
		error(400, `Expected ids: 1 to ${MARK_READ_MAX} announcement ids`);
	}

	await markAnnouncementsRead(locals.db, locals.user.id, ids);
	return new Response(null, { status: 204 });
};
