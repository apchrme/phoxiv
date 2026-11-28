import type { PageServerLoad } from './$types';
import { setNoStore } from '#lib/server/cache.js';
import { listAllReadIds, listAnnouncements } from '#lib/server/db/queries/announcements.js';

/**
 * Every announcement, newest first. Outside `(reg)` and `no-store`: in the
 * 4h browser cache it would lag the bell, which links here and is fetched
 * fresh. Being uncached, it may also carry the signed-in user's seen set
 * (`read`; `null` when signed out), as the dashboard carries its counts.
 */
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setNoStore(setHeaders);
	const [announcements, read] = await Promise.all([
		listAnnouncements(locals.db),
		locals.user ? listAllReadIds(locals.db, locals.user.id) : null
	]);
	return { announcements, read };
};
