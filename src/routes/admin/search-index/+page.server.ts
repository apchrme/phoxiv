import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '#lib/server/guard.js';
import { ok } from '#lib/server/forms.js';
import {
	ensureFileTextIndex,
	getFileTextStats,
	optimizeFileTextIndex,
	pruneFileText
} from '#lib/server/db/queries/files.js';

/**
 * The counts cost thousands of D1 rows, which is why this is its own page:
 * only an admin who opens it pays for them. The menu link at `/admin` turns
 * off hover preloading for the same reason. Each maintenance action reloads
 * the page data, so the counts after an action are fresh.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { db } = requireAdmin(locals);
	return { stats: await getFileTextStats(db) };
};

export const actions: Actions = {
	/**
	 * Recreates the FTS5 table and triggers if missing, then rebuilds the index
	 * from `file_text` (no re-extraction). See docs/data-model.md, "Recovery".
	 */
	ensureIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		await ensureFileTextIndex(db);
		return ok('ensureIndex');
	},

	/**
	 * Merges index segments, with bounded work per call to stay under D1's query
	 * time limit. Run again if there is more to do.
	 */
	optimizeIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		await optimizeFileTextIndex(db);
		return ok('optimizeIndex');
	},

	/** Drops `file_text` rows for files that no longer exist. Reclaims space only. */
	pruneIndex: async ({ locals }) => {
		const { db } = requireAdmin(locals);
		return ok('pruneIndex', { pruned: await pruneFileText(db) });
	}
};
