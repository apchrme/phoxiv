import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq, notInArray } from 'drizzle-orm';
import { problemFiles, problems, yearFiles, years } from '$lib/server/db';
import { requireOlympiadEditor } from '$lib/server/guard';
import { logActivity } from '$lib/server/activity-log';
import { requireOlympiad } from '$lib/server/db/queries/olympiads';
import { getYear, YEAR_NOT_FOUND } from '$lib/server/db/queries/years';
import { getYearContent } from '$lib/server/db/queries/content';
import { actionFail, field, fieldList, fileField, ok, parseYear } from '$lib/server/forms';
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
import { collidingLabel, DOCUMENT_UPLOAD, isHttpUrl } from '$lib/uploads';
import { parseLabelledUrls, parseStringArray } from '$lib/utils/json';
import { parseTopics, serializeTopics } from '$lib/utils/topics';
import { parseMaxScore } from '$lib/progress';
import {
	deleteFileTextForUrl,
	deleteFileTextForUrls,
	getFileTextStatuses,
	putFileText
} from '$lib/server/db/queries/files';
import { duplicateProblemNumbers, invalidMaxScores } from './metadata';

/** Whether a file belongs to the year as a whole or to one problem. */
type Scope = 'year' | 'problem';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Authorise before reading: the layout guard only checks the role, not this
	// olympiad. Permission first, existence second.
	const { db } = requireOlympiadEditor(locals, params.olympiad);

	const yearNum = parseYear(params.year);
	if (yearNum === null) error(400, 'Invalid year');

	// A missing olympiad rejects the Promise.all, so its 404 wins over the year's.
	const [olympiadRow, yearRow] = await Promise.all([
		requireOlympiad(db, params.olympiad),
		getYear(db, params.olympiad, yearNum)
	]);
	if (!yearRow) error(404, YEAR_NOT_FOUND);

	const { yearFiles: yearFileEntries, problems: problemEntries } = await getYearContent(
		db,
		yearRow.id
	);

	// Text-extraction status of each file, for the badges in `FileSection`.
	const fileTextStatus = await getFileTextStatuses(db, [
		...yearFileEntries.map((f) => f.url),
		...problemEntries.flatMap((p) => p.files.map((f) => f.url))
	]);

	return {
		olympiad: { id: olympiadRow.id, name: olympiadRow.name },
		year: {
			id: yearRow.id,
			year: yearRow.year,
			notes: parseStringArray(yearRow.notes),
			extraLinks: parseLabelledUrls(yearRow.extraLinks)
		},
		yearFiles: yearFileEntries,
		problems: problemEntries,
		fileTextStatus
	};
};

export const actions: Actions = {
	/**
	 * Replaces the year's notes, extra links and problem list. The four problem
	 * fields are aligned by position, one of each per editor row.
	 */
	saveMetadata: async ({ request, params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const yearNum = parseYear(params.year)!;
		const data = await request.formData();

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return actionFail(404, 'saveMetadata', YEAR_NOT_FOUND);

		const notes = fieldList(data, 'note')
			.map((n) => n.trim())
			.filter(Boolean);
		const linkLabels = fieldList(data, 'linkLabel');
		const linkUrls = fieldList(data, 'linkUrl');
		const extraLinks = linkLabels
			.map((label, i) => ({ label: label.trim(), url: (linkUrls[i] ?? '').trim() }))
			.filter((l) => l.label && l.url);

		// The olympiad page renders these as `href`s, so a `javascript:` URL would be
		// stored XSS against whoever clicks it, admins included.
		const badLink = extraLinks.find((l) => !isHttpUrl(l.url));
		if (badLink) {
			return actionFail(
				400,
				'saveMetadata',
				`Link "${badLink.label}" must be a web address starting with http:// or https://`
			);
		}

		const rawNumbers = fieldList(data, 'problemNumber').map((n) => n.trim());
		const rawTitles = fieldList(data, 'problemTitle');
		const rawTopics = fieldList(data, 'problemTopics');
		const rawMaxScores = fieldList(data, 'problemMaxScore');
		// Max score stays a raw string so only surviving rows are validated.
		const submitted = rawNumbers
			.map((number, i) => ({
				number,
				title: (rawTitles[i] ?? '').trim() || null,
				topics: serializeTopics(parseTopics(rawTopics[i])),
				maxScore: (rawMaxScores[i] ?? '').trim()
			}))
			.filter((p) => p.number);

		// Upserting duplicates over each other would lose one problem's files.
		// Uses the same helper as the editor so the checks agree.
		const [duplicate] = duplicateProblemNumbers(submitted);
		if (duplicate !== undefined) {
			return actionFail(400, 'saveMetadata', `Duplicate problem number: ${duplicate}`);
		}

		// The number is an R2 key segment, so a slash would nest files. Rejected, not
		// slugified: keys use the raw number, and normalising would orphan files.
		const nested = submitted.find((p) => p.number.includes('/'));
		if (nested) {
			return actionFail(400, 'saveMetadata', `Problem number cannot include /: ${nested.number}`);
		}

		// After the blank-number filter, so a discarded row can't block the save.
		const [badMaxScore] = invalidMaxScores(submitted);
		if (badMaxScore !== undefined) {
			return actionFail(
				400,
				'saveMetadata',
				`Maximum score for problem ${badMaxScore.number}: ${badMaxScore.error}`
			);
		}

		// Problems no longer listed were removed (a renumber is delete + insert).
		// One condition for both the file lookup and the delete, so they agree.
		const submittedNumbers = submitted.map((p) => p.number);
		const removed =
			submittedNumbers.length > 0
				? and(eq(problems.yearId, yearRow.id), notInArray(problems.number, submittedNumbers))
				: eq(problems.yearId, yearRow.id);

		// The cascade deletes the problemFiles rows, which are the only record of
		// the R2 keys, so collect the URLs first. Read before any write so the
		// storage check below can still refuse cleanly.
		const orphaned = await db
			.select({ url: problemFiles.url })
			.from(problemFiles)
			.innerJoin(problems, eq(problems.id, problemFiles.problemId))
			.where(removed)
			.all();

		// Need a bucket only if something must be deleted, so an R2 outage doesn't
		// block ordinary saves.
		let bucket: R2Bucket | null = null;
		if (orphaned.length > 0) {
			bucket = getBucket(platform);
			if (!bucket) return actionFail(500, 'saveMetadata', STORAGE_UNAVAILABLE);
		}

		// ── Every check is above this line. ─────────────────────────────────────
		// The writes below are one D1 batch, which is a transaction: the save
		// happens completely or not at all. Keep every `actionFail` above, so a
		// refusal never follows a write.
		const upserts = submitted.map(({ number, title, topics, maxScore: rawMaxScore }) => {
			// Already validated above; a branch rather than a cast keeps it type-safe.
			const parsedMaxScore = parseMaxScore(rawMaxScore);
			const maxScore = parsedMaxScore.ok ? parsedMaxScore.value : null;
			return (
				db
					.insert(problems)
					.values({ yearId: yearRow.id, number, title, topics, maxScore })
					// `maxScore` must be in `set` too, or blanking it would never clear it.
					.onConflictDoUpdate({
						target: [problems.yearId, problems.number],
						set: { title, topics, maxScore }
					})
			);
		});
		await db.batch([
			db
				.update(years)
				.set({ notes: JSON.stringify(notes), extraLinks: JSON.stringify(extraLinks) })
				.where(eq(years.id, yearRow.id)),
			...upserts,
			db.delete(problems).where(removed)
		]);

		// Cleanup after the commit, and best-effort. R2 goes after the rows on
		// purpose: a failure here leaves unreferenced objects, never rows pointing
		// at deleted files.
		if (bucket) {
			await deleteByUrls(
				bucket,
				orphaned.map((f) => f.url)
			);
		}
		await deleteFileTextForUrls(
			db,
			orphaned.map((f) => f.url)
		).catch(() => {});

		await logActivity(
			db,
			user,
			'save_metadata',
			`Saved metadata (${notes.length} notes, ${extraLinks.length} links, ${submitted.length} problems, ` +
				`${submitted.filter((p) => p.maxScore).length} with a maximum score)`,
			{ olympiadId: params.olympiad, year: yearNum }
		);

		return ok('saveMetadata');
	},

	/** Deletes the year, its problems, and every R2 object either owns. */
	deleteYear: async ({ params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const bucket = getBucket(platform);
		if (!bucket) return actionFail(500, 'deleteYear', STORAGE_UNAVAILABLE);
		const yearNum = parseYear(params.year)!;

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return actionFail(404, 'deleteYear', YEAR_NOT_FOUND);

		// Collect URLs before the rows go; they are the only record of the R2 keys.
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

		// Best-effort. URLs are namespaced by olympiad and year, so none is shared.
		await deleteFileTextForUrls(db, [
			...yearFileRows.map((f) => f.url),
			...problemFileRows.map((f) => f.url)
		]).catch(() => {});

		await logActivity(db, user, 'delete_year', `Deleted year ${yearNum}`, {
			olympiadId: params.olympiad,
			year: yearNum
		});

		redirect(303, `/contribute/${params.olympiad}`);
	},

	uploadFile: async ({ request, params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const bucket = getBucket(platform);
		if (!bucket) return actionFail(500, 'uploadFile', STORAGE_UNAVAILABLE);
		const yearNum = parseYear(params.year)!;
		const data = await request.formData();

		const label = field(data, 'label');
		const scope = field(data, 'scope') as Scope;
		const problemNumber = field(data, 'problemNumber');

		if (!label) return actionFail(400, 'uploadFile', 'Label is required');
		if (scope !== 'year' && scope !== 'problem')
			return actionFail(400, 'uploadFile', 'Scope is required');
		if (scope === 'problem' && !problemNumber) {
			return actionFail(400, 'uploadFile', 'Problem number required');
		}
		// The label becomes a path segment, so a slash would silently nest the object.
		if (label.includes('/')) return actionFail(400, 'uploadFile', 'Label cannot include /');
		// An all-punctuation label slugs to "" and would key the object as a bare ".pdf".
		if (!slugifyLabel(label)) {
			return actionFail(400, 'uploadFile', 'Label must include a letter or number');
		}

		const validated = validateUpload(fileField(data, 'file'), DOCUMENT_UPLOAD);
		if (!validated.ok) return actionFail(400, 'uploadFile', validated.error);
		const { file, ext, contentType } = validated.value;

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return actionFail(404, 'uploadFile', YEAR_NOT_FOUND);

		let problemRow: typeof problems.$inferSelect | undefined;

		if (scope === 'problem') {
			problemRow = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (!problemRow) {
				return actionFail(
					404,
					'uploadFile',
					`Problem ${problemNumber} not found — save metadata first`
				);
			}
		}

		// Reject a colliding label rather than overwrite. Same label with another
		// extension would orphan the old object; a different label with the same
		// slug would silently replace it. Checked in JS since SQLite can't slugify.
		const siblings = problemRow
			? await db
					.select({ label: problemFiles.label })
					.from(problemFiles)
					.where(eq(problemFiles.problemId, problemRow.id))
					.all()
			: await db
					.select({ label: yearFiles.label })
					.from(yearFiles)
					.where(eq(yearFiles.yearId, yearRow.id))
					.all();
		const collision = collidingLabel(
			siblings.map((f) => f.label),
			label
		);
		if (collision !== null) {
			const owner = scope === 'year' ? 'this year' : 'this problem';
			return actionFail(
				400,
				'uploadFile',
				collision === label
					? `A file named "${label}" already exists for ${owner}.`
					: `"${label}" and the existing "${collision}" would be stored as the same file. Rename one of them.`
			);
		}

		// Use `yearNum`, never raw `params.year`: `parseYear` accepts "2020abc", and
		// a `%2F` in the segment could write under an arbitrary prefix.
		const key = fileKey(
			params.olympiad,
			yearNum,
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

		// ── Nothing below this line may fail the upload. ────────────────────────
		// The file is already stored. Bad or missing `extractedText` (parsed in the
		// browser) becomes a `pending` row for the backfill, never a failed upload.
		await putFileText(db, url, ext, field(data, 'extractedText')).catch(() => {});

		await logActivity(
			db,
			user,
			'upload_file',
			`Uploaded "${label}" for ${scope === 'year' ? 'year' : `problem ${problemNumber}`}`,
			{ olympiadId: params.olympiad, year: yearNum }
		);

		return ok('uploadFile');
	},

	deleteFile: async ({ request, params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const bucket = getBucket(platform);
		if (!bucket) return actionFail(500, 'deleteFile', STORAGE_UNAVAILABLE);
		const yearNum = parseYear(params.year)!;
		const data = await request.formData();

		const label = field(data, 'label');
		const scope = field(data, 'scope') as Scope;
		const problemNumber = field(data, 'problemNumber');

		const yearRow = await getYear(db, params.olympiad, yearNum);
		if (!yearRow) return actionFail(404, 'deleteFile', YEAR_NOT_FOUND);

		if (scope === 'year') {
			const record = await db
				.select()
				.from(yearFiles)
				.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.label, label)))
				.get();
			if (!record) return actionFail(404, 'deleteFile', 'File not found');

			// Use the stored URL, never a submitted one, or a crafted value could
			// delete any object.
			await deleteByUrl(bucket, record.url);
			await db.delete(yearFiles).where(eq(yearFiles.id, record.id)).run();
			await deleteFileTextForUrl(db, record.url).catch(() => {});
		} else {
			const problem = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (!problem) return actionFail(404, 'deleteFile', 'Problem not found');

			const record = await db
				.select()
				.from(problemFiles)
				.where(and(eq(problemFiles.problemId, problem.id), eq(problemFiles.label, label)))
				.get();
			if (!record) return actionFail(404, 'deleteFile', 'File not found');

			await deleteByUrl(bucket, record.url);
			await db.delete(problemFiles).where(eq(problemFiles.id, record.id)).run();
			// Best-effort: the file is already gone, and search joins back to the file
			// tables, so a leftover text row is never shown.
			await deleteFileTextForUrl(db, record.url).catch(() => {});
		}

		await logActivity(
			db,
			user,
			'delete_file',
			`Deleted "${label}" from ${scope === 'year' ? 'year' : `problem ${problemNumber}`}`,
			{ olympiadId: params.olympiad, year: yearNum }
		);

		return ok('deleteFile');
	}
};
