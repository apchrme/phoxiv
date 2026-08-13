import { redirect, error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq, notInArray } from 'drizzle-orm';
import { problemFiles, problems, yearFiles, years } from '$lib/server/db';
import { requireOlympiadEditor } from '$lib/server/guard';
import { logActivity } from '$lib/server/activity-log';
import { requireOlympiad } from '$lib/server/db/queries/olympiads';
import { getYear, YEAR_NOT_FOUND } from '$lib/server/db/queries/years';
import { getYearContent } from '$lib/server/db/queries/content';
import { field, fieldList, fileField, parseYear } from '$lib/server/forms';
import {
	cdnUrl,
	deleteByUrl,
	deleteByUrls,
	fileKey,
	getBucket,
	slugifyLabel,
	STORAGE_UNAVAILABLE
} from '$lib/server/storage';
import { validateUpload } from '$lib/server/uploads';
import { DOCUMENT_UPLOAD } from '$lib/uploads';
import { parseLabelledUrls, parseStringArray } from '$lib/utils/json';
import { parseTopics, serializeTopics } from '$lib/utils/topics';

/** Whether a file belongs to the year as a whole or to one problem. */
type Scope = 'year' | 'problem';

export const load: PageServerLoad = async ({ params, locals }) => {
	const yearNum = parseYear(params.year);
	if (yearNum === null) error(400, 'Invalid year');

	const olympiadRow = await requireOlympiad(locals.db, params.olympiad);

	const yearRow = await getYear(locals.db, params.olympiad, yearNum);
	if (!yearRow) error(404, YEAR_NOT_FOUND);

	const { yearFiles: yearFileEntries, problems: problemEntries } = await getYearContent(
		locals.db,
		yearRow.id
	);

	return {
		olympiad: { id: olympiadRow.id, name: olympiadRow.name },
		year: {
			id: yearRow.id,
			year: yearRow.year,
			notes: parseStringArray(yearRow.notes),
			extraLinks: parseLabelledUrls(yearRow.extraLinks)
		},
		yearFiles: yearFileEntries,
		problems: problemEntries
	};
};

export const actions: Actions = {
	/**
	 * Replaces the year's notes, extra links and problem list in one shot.
	 *
	 * The three problem fields (`problemNumber`, `problemTitle`, `problemTopics`)
	 * are positionally aligned: one of each per row in the editor's repeater.
	 */
	saveMetadata: async ({ request, params, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const yearNum = parseYear(params.year)!;
		const data = await request.formData();

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return fail(404, { error: YEAR_NOT_FOUND });

		const notes = fieldList(data, 'note')
			.map((n) => n.trim())
			.filter(Boolean);
		const linkLabels = fieldList(data, 'linkLabel');
		const linkUrls = fieldList(data, 'linkUrl');
		const extraLinks = linkLabels
			.map((label, i) => ({ label: label.trim(), url: (linkUrls[i] ?? '').trim() }))
			.filter((l) => l.label && l.url);

		await db
			.update(years)
			.set({ notes: JSON.stringify(notes), extraLinks: JSON.stringify(extraLinks) })
			.where(eq(years.id, yearRow.id))
			.run();

		const rawNumbers = fieldList(data, 'problemNumber').map((n) => n.trim());
		const rawTitles = fieldList(data, 'problemTitle');
		const rawTopics = fieldList(data, 'problemTopics');
		const submitted = rawNumbers
			.map((number, i) => ({
				number,
				title: (rawTitles[i] ?? '').trim() || null,
				topics: serializeTopics(parseTopics(rawTopics[i]))
			}))
			.filter((p) => p.number);

		// Reject duplicates rather than silently upserting them over each other,
		// which would lose one of the two problems' files.
		const seenNumbers = new Set<string>();
		for (const { number } of submitted) {
			if (seenNumbers.has(number)) {
				return fail(400, { error: `Duplicate problem number: ${number}` });
			}
			seenNumbers.add(number);
		}

		for (const { number, title, topics } of submitted) {
			await db
				.insert(problems)
				.values({ yearId: yearRow.id, number, title, topics })
				.onConflictDoUpdate({
					target: [problems.yearId, problems.number],
					set: { title, topics }
				})
				.run();
		}

		// Anything the editor no longer lists was removed by the user. Cascades to
		// problemFiles via the FK, though their R2 objects are left orphaned —
		// deleting a whole year is the path that cleans up storage.
		const submittedNumbers = submitted.map((p) => p.number);
		await db
			.delete(problems)
			.where(
				submittedNumbers.length > 0
					? and(eq(problems.yearId, yearRow.id), notInArray(problems.number, submittedNumbers))
					: eq(problems.yearId, yearRow.id)
			)
			.run();

		await logActivity(
			db,
			user,
			'save_metadata',
			`Saved metadata (${notes.length} notes, ${extraLinks.length} links, ${submitted.length} problems)`,
			{ olympiadId: params.olympiad, year: yearNum }
		);

		return { success: true, action: 'saveMetadata' as const };
	},

	/** Deletes the year, its problems, and every R2 object either owns. */
	deleteYear: async ({ params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const bucket = getBucket(platform);
		if (!bucket) return fail(500, { error: STORAGE_UNAVAILABLE });
		const yearNum = parseYear(params.year)!;

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return fail(404, { error: YEAR_NOT_FOUND });

		// Collect the object URLs before the rows go away — they are the only
		// record of which R2 keys belong to this year.
		const [yearFileRows, problemFileRows] = await Promise.all([
			db
				.select({ url: yearFiles.url })
				.from(yearFiles)
				.where(eq(yearFiles.yearId, yearRow.id))
				.all(),
			db
				.select({ url: problemFiles.url })
				.from(problemFiles)
				.innerJoin(problems, eq(problems.id, problemFiles.problemId))
				.where(eq(problems.yearId, yearRow.id))
				.all()
		]);

		await deleteByUrls(bucket, [
			...yearFileRows.map((f) => f.url),
			...problemFileRows.map((f) => f.url)
		]);

		// Cascades to `problems`, `yearFiles`, `problemFiles` via FK onDelete: 'cascade'
		await db.delete(years).where(eq(years.id, yearRow.id)).run();

		await logActivity(db, user, 'delete_year', `Deleted year ${yearNum}`, {
			olympiadId: params.olympiad,
			year: yearNum
		});

		redirect(303, `/contribute/${params.olympiad}`);
	},

	uploadFile: async ({ request, params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const bucket = getBucket(platform);
		if (!bucket) return fail(500, { error: STORAGE_UNAVAILABLE });
		const yearNum = parseYear(params.year)!;
		const data = await request.formData();

		const label = field(data, 'label');
		const scope = field(data, 'scope') as Scope;
		const problemNumber = field(data, 'problemNumber');

		if (!label) return fail(400, { error: 'Label is required' });
		if (scope !== 'year' && scope !== 'problem') return fail(400, { error: 'Scope is required' });
		if (scope === 'problem' && !problemNumber) {
			return fail(400, { error: 'Problem number required' });
		}
		// The label becomes a path segment, so a slash would silently nest the object.
		if (label.includes('/')) return fail(400, { error: 'Label cannot include /' });

		const validated = validateUpload(fileField(data, 'file'), DOCUMENT_UPLOAD);
		if (!validated.ok) return fail(400, { error: validated.error });
		const { file, ext, contentType } = validated.value;

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return fail(404, { error: YEAR_NOT_FOUND });

		let problemRow: typeof problems.$inferSelect | undefined;

		if (scope === 'problem') {
			problemRow = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (!problemRow) {
				return fail(404, { error: `Problem ${problemNumber} not found — save metadata first` });
			}
		}

		// Reject a duplicate label rather than overwriting: the existing object may
		// have a different extension, which would leave the old file orphaned but
		// still linked from the database.
		const duplicate = problemRow
			? await db
					.select({ url: problemFiles.url })
					.from(problemFiles)
					.where(and(eq(problemFiles.problemId, problemRow.id), eq(problemFiles.label, label)))
					.get()
			: await db
					.select({ url: yearFiles.url })
					.from(yearFiles)
					.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.label, label)))
					.get();
		if (duplicate) {
			const owner = scope === 'year' ? 'this year' : 'this problem';
			return fail(400, { error: `A file named "${label}" already exists for ${owner}.` });
		}

		const key = fileKey(
			params.olympiad,
			params.year,
			slugifyLabel(label),
			ext,
			scope === 'problem' ? problemNumber : undefined
		);
		await bucket.put(key, file.stream(), { httpMetadata: { contentType } });
		const url = cdnUrl(key);

		if (scope === 'year') {
			await db
				.insert(yearFiles)
				.values({ yearId: yearRow.id, label, url })
				.onConflictDoUpdate({ target: [yearFiles.yearId, yearFiles.label], set: { url } })
				.run();
		} else {
			await db
				.insert(problemFiles)
				.values({ problemId: problemRow!.id, label, url })
				.onConflictDoUpdate({ target: [problemFiles.problemId, problemFiles.label], set: { url } })
				.run();
		}

		await logActivity(
			db,
			user,
			'upload_file',
			`Uploaded "${label}" for ${scope === 'year' ? 'year' : `problem ${problemNumber}`}`,
			{ olympiadId: params.olympiad, year: yearNum }
		);

		return { success: true, action: 'uploadFile' as const };
	},

	deleteFile: async ({ request, params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const bucket = getBucket(platform);
		if (!bucket) return fail(500, { error: STORAGE_UNAVAILABLE });
		const yearNum = parseYear(params.year)!;
		const data = await request.formData();

		const label = field(data, 'label');
		const scope = field(data, 'scope') as Scope;
		const problemNumber = field(data, 'problemNumber');

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return fail(404, { error: YEAR_NOT_FOUND });

		if (scope === 'year') {
			const record = await db
				.select()
				.from(yearFiles)
				.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.label, label)))
				.get();
			if (!record) return fail(404, { error: 'File not found' });

			// Derive the R2 key from the stored URL, never from the submitted one:
			// a crafted value could otherwise delete an arbitrary object.
			await deleteByUrl(bucket, record.url);
			await db.delete(yearFiles).where(eq(yearFiles.id, record.id)).run();
		} else {
			const problem = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (!problem) return fail(404, { error: 'Problem not found' });

			const record = await db
				.select()
				.from(problemFiles)
				.where(and(eq(problemFiles.problemId, problem.id), eq(problemFiles.label, label)))
				.get();
			if (!record) return fail(404, { error: 'File not found' });

			await deleteByUrl(bucket, record.url);
			await db.delete(problemFiles).where(eq(problemFiles.id, record.id)).run();
		}

		await logActivity(
			db,
			user,
			'delete_file',
			`Deleted "${label}" from ${scope === 'year' ? 'year' : `problem ${problemNumber}`}`,
			{ olympiadId: params.olympiad, year: yearNum }
		);

		return { success: true, action: 'deleteFile' as const };
	}
};
