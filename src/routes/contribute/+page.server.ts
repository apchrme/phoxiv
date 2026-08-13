import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { olympiads, years } from '$lib/server/db';
import { canEditOlympiad, getAssignedOlympiadIds, requireAdmin } from '$lib/server/guard';
import { logActivity } from '$lib/server/activity-log';
import { renderMarkdownOrNull } from '$lib/server/markdown';
import { listOlympiadOptions } from '$lib/server/db/queries/olympiads';
import { ensureYear } from '$lib/server/db/queries/years';
import { field, fieldOrNull, fileField, parseYear, YEAR_RANGE_ERROR } from '$lib/server/forms';
import { cdnUrl, getBucket, iconKey, STORAGE_UNAVAILABLE } from '$lib/server/storage';
import { validateUpload } from '$lib/server/uploads';
import { ICON_UPLOAD } from '$lib/uploads';
import { isOlympiadTag } from '$lib/types';

/** The olympiads this user may pick from — all of them for admins. */
export const load: PageServerLoad = async ({ locals }) => {
	const rows = await listOlympiadOptions(locals.db);

	if (locals.user?.role === 'admin') return { olympiads: rows };

	const assigned = new Set(getAssignedOlympiadIds(locals.user));
	return { olympiads: rows.filter((o) => assigned.has(o.id)) };
};

export const actions: Actions = {
	/** Jumps to a year's editor, creating the year record if it's new. */
	selectYear: async ({ request, locals }) => {
		const db = locals.db;
		const data = await request.formData();
		const olympiadId = field(data, 'olympiadId');
		const yearRaw = field(data, 'year');

		if (!olympiadId) return fail(400, { selectError: 'Please select an olympiad' });

		// This action needs its own permission check: the layout guard only
		// establishes that the user is *a* contributor, not that they may edit
		// this particular olympiad.
		if (!canEditOlympiad(locals.user, olympiadId)) {
			return fail(403, { selectError: 'You are not permitted to edit this olympiad' });
		}

		// No year given — go to the olympiad's metadata page instead.
		if (!yearRaw) redirect(303, `/contribute/${olympiadId}`);

		const year = parseYear(yearRaw);
		if (year === null) return fail(400, { selectError: YEAR_RANGE_ERROR });

		const { created } = await ensureYear(db, olympiadId, year);
		if (created) {
			await logActivity(db, locals.user, 'add_year', `Added year ${year}`, { olympiadId, year });
		}

		redirect(303, `/contribute/${olympiadId}/${year}`);
	},

	/**
	 * Creating brand-new olympiads stays admin-only — contributors work within
	 * olympiads they've already been assigned, they don't create new ones.
	 */
	createOlympiad: async ({ request, locals, platform }) => {
		const { db, user } = requireAdmin(locals);

		const data = await request.formData();
		// Ids appear in URLs and R2 keys, so they are slugified rather than validated.
		const id = field(data, 'id').toLowerCase().replace(/\s+/g, '-');
		const name = field(data, 'name');
		const summary = field(data, 'summary');
		const tag = field(data, 'tag');
		const year = parseYear(field(data, 'year'));
		const descriptionMd = fieldOrNull(data, 'description');
		const iconFile = fileField(data, 'iconFile');
		// Emoji icon field — used when no image file is uploaded.
		const emojiIcon = field(data, 'icon');

		if (!id || !name || !summary || !tag || year === null) {
			return fail(400, { createError: 'All required fields must be filled in' });
		}
		if (!isOlympiadTag(tag)) return fail(400, { createError: 'Invalid tag' });

		let iconValue = emojiIcon;
		if (iconFile) {
			const bucket = getBucket(platform);
			if (!bucket) return fail(500, { createError: `${STORAGE_UNAVAILABLE} for icon upload` });

			const validated = validateUpload(iconFile, ICON_UPLOAD, 'Icon file');
			if (!validated.ok) return fail(400, { createError: validated.error });

			const { file, ext, contentType } = validated.value;
			const key = iconKey(id, ext);
			await bucket.put(key, file.stream(), { httpMetadata: { contentType } });
			iconValue = cdnUrl(key);
		}

		try {
			await db
				.insert(olympiads)
				.values({
					id,
					name,
					summary,
					icon: iconValue,
					tag,
					descriptionMd,
					descriptionHtml: await renderMarkdownOrNull(descriptionMd)
				})
				.run();
		} catch {
			// The only realistic failure is the primary-key conflict.
			return fail(400, { createError: `An olympiad with the ID "${id}" already exists` });
		}

		await db.insert(years).values({ olympiadId: id, year, notes: '[]', extraLinks: '[]' }).run();

		await logActivity(db, user, 'create_olympiad', `Created "${name}" (${id})`, {
			olympiadId: id,
			year
		});

		redirect(303, `/contribute/${id}/${year}`);
	}
};
