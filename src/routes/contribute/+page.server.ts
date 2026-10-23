import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { olympiads } from '#lib/server/db/index.js';
import { canEditOlympiad, requireAdmin } from '#lib/server/guard.js';
import { logActivity } from '#lib/server/activity-log.js';
import { renderMarkdownOrNull } from '#lib/server/markdown.js';
import { getOlympiad, listOlympiadOptions } from '#lib/server/db/queries/olympiads.js';
import { ensureYear, insertYear } from '#lib/server/db/queries/years.js';
import {
	actionFail,
	field,
	fieldOrNull,
	fileField,
	parseYear,
	YEAR_RANGE_ERROR
} from '#lib/server/forms.js';
import { cdnUrl, getBucket, iconKey, STORAGE_UNAVAILABLE } from '#lib/server/storage.js';
import { validateUpload } from '#lib/server/uploads.js';
import { ICON_UPLOAD } from '#lib/uploads.js';
import { isOlympiadId, isOlympiadTag } from '#lib/types.js';

/** The olympiads this user may pick from — all of them for admins. */
export const load: PageServerLoad = async ({ locals }) => {
	const rows = await listOlympiadOptions(locals.db);
	return { olympiads: rows.filter((o) => canEditOlympiad(locals.user, o.id)) };
};

export const actions: Actions = {
	/** Jumps to a year's editor, creating the year record if it's new. */
	selectYear: async ({ request, locals }) => {
		const db = locals.db;
		const data = await request.formData();
		const olympiadId = field(data, 'olympiadId');
		const yearRaw = field(data, 'year');

		if (!olympiadId) return actionFail(400, 'selectYear', 'Please select an olympiad');

		// The layout guard checks only the role, not this olympiad.
		if (!canEditOlympiad(locals.user, olympiadId)) {
			return actionFail(403, 'selectYear', 'You are not permitted to edit this olympiad');
		}

		// No year given — go to the olympiad's metadata page instead.
		if (!yearRaw) redirect(303, `/contribute/${olympiadId}`);

		const year = parseYear(yearRaw);
		if (year === null) return actionFail(400, 'selectYear', YEAR_RANGE_ERROR);

		const { created } = await ensureYear(db, olympiadId, year);
		if (created) {
			await logActivity(db, locals.user, 'add_year', `Added year ${year}`, { olympiadId, year });
		}

		redirect(303, `/contribute/${olympiadId}/${year}`);
	},

	/** Admin-only: contributors edit assigned olympiads but can't create them. */
	createOlympiad: async ({ request, locals }) => {
		const { db, user } = requireAdmin(locals);

		const data = await request.formData();
		// Ids appear in URLs and R2 keys: whitespace becomes a hyphen, then the result
		// is validated below.
		const id = field(data, 'id').toLowerCase().replace(/\s+/g, '-');
		const name = field(data, 'name');
		const summary = field(data, 'summary');
		const tag = field(data, 'tag');
		const year = parseYear(field(data, 'year'));
		const descriptionMd = fieldOrNull(data, 'description');
		const iconFile = fileField(data, 'iconFile');
		// Used when no image file is uploaded.
		const emojiIcon = field(data, 'icon');

		if (!id || !name || !summary || !tag || year === null) {
			return actionFail(400, 'createOlympiad', 'All required fields must be filled in');
		}
		// Anything else (`/`, `?`, `#`, `.`) would break URLs and R2 keys, and the
		// olympiad couldn't be picked in deep search's filter.
		if (!isOlympiadId(id)) {
			return actionFail(
				400,
				'createOlympiad',
				'The ID may use only lowercase letters, digits and hyphens (at most 32), and cannot start with a hyphen'
			);
		}
		if (!isOlympiadTag(tag)) return actionFail(400, 'createOlympiad', 'Invalid tag');

		// Check before uploading: the icon key is derived from the id, so uploading
		// first would overwrite an existing olympiad's icon when the insert then fails.
		if (await getOlympiad(db, id)) {
			return actionFail(400, 'createOlympiad', `An olympiad with the ID "${id}" already exists`);
		}

		let iconValue = emojiIcon;
		if (iconFile) {
			const bucket = getBucket();
			if (!bucket)
				return actionFail(500, 'createOlympiad', `${STORAGE_UNAVAILABLE} for icon upload`);

			const validated = validateUpload(iconFile, ICON_UPLOAD, 'Icon file');
			if (!validated.ok) return actionFail(400, 'createOlympiad', validated.error);

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
			// A primary-key conflict from a concurrent create; the check above covers the rest.
			return actionFail(400, 'createOlympiad', `An olympiad with the ID "${id}" already exists`);
		}

		await insertYear(db, id, year);

		await logActivity(db, user, 'create_olympiad', `Created "${name}" (${id})`, {
			olympiadId: id,
			year
		});

		redirect(303, `/contribute/${id}/${year}`);
	}
};
