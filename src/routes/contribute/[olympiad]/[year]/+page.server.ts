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
import { collidingLabel, DOCUMENT_UPLOAD } from '$lib/uploads';
import { parseLabelledUrls, parseStringArray } from '$lib/utils/json';
import { parseTopics, serializeTopics } from '$lib/utils/topics';
import { parseMaxScore } from '$lib/progress';
import { duplicateProblemNumbers, invalidMaxScores } from './metadata';

/** Whether a file belongs to the year as a whole or to one problem. */
type Scope = 'year' | 'problem';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Authorise before reading, for the reason spelled out in `../+page.server.ts`:
	// the layout guard says this is a contributor, not that they may edit *this*
	// olympiad. Permission first, existence second.
	const { db } = requireOlympiadEditor(locals, params.olympiad);

	const yearNum = parseYear(params.year);
	if (yearNum === null) error(400, 'Invalid year');

	// Independent reads. `requireOlympiad` throws inside the promise, so a missing
	// olympiad still rejects before the `if (!yearRow)` line — the 404 for the
	// olympiad keeps winning over the one for the year.
	const [olympiadRow, yearRow] = await Promise.all([
		requireOlympiad(db, params.olympiad),
		getYear(db, params.olympiad, yearNum)
	]);
	if (!yearRow) error(404, YEAR_NOT_FOUND);

	// Sequential on purpose: this one genuinely needs `yearRow.id`.

	const { yearFiles: yearFileEntries, problems: problemEntries } = await getYearContent(
		db,
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
	 * The four problem fields (`problemNumber`, `problemTitle`, `problemTopics`,
	 * `problemMaxScore`) are positionally aligned: one of each per row in the
	 * editor's repeater.
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

		await db
			.update(years)
			.set({ notes: JSON.stringify(notes), extraLinks: JSON.stringify(extraLinks) })
			.where(eq(years.id, yearRow.id))
			.run();

		const rawNumbers = fieldList(data, 'problemNumber').map((n) => n.trim());
		const rawTitles = fieldList(data, 'problemTitle');
		const rawTopics = fieldList(data, 'problemTopics');
		const rawMaxScores = fieldList(data, 'problemMaxScore');
		// The maximum score stays a raw string through the zip and the filter below,
		// so that it is validated only for the rows that actually survive.
		const submitted = rawNumbers
			.map((number, i) => ({
				number,
				title: (rawTitles[i] ?? '').trim() || null,
				topics: serializeTopics(parseTopics(rawTopics[i])),
				maxScore: (rawMaxScores[i] ?? '').trim()
			}))
			.filter((p) => p.number);

		// Reject duplicates rather than silently upserting them over each other,
		// which would lose one of the two problems' files. Shares the editor's
		// helper so the two halves of the check cannot drift apart.
		const [duplicate] = duplicateProblemNumbers(submitted);
		if (duplicate !== undefined) {
			return actionFail(400, 'saveMetadata', `Duplicate problem number: ${duplicate}`);
		}

		// The number becomes a path segment of every key under this problem, so a
		// slash would nest its files a level deeper than `fileKey` intends — the same
		// reason `uploadFile` forbids one in a label. Rejected rather than slugified:
		// keys are built from the raw number, and normalising it now would orphan
		// every file already uploaded under a number that normalising would change.
		const nested = submitted.find((p) => p.number.includes('/'));
		if (nested) {
			return actionFail(400, 'saveMetadata', `Problem number cannot include /: ${nested.number}`);
		}

		// Checked *after* the blank-number filter above, so a stray character left
		// in a row the contributor is about to discard cannot block the save. Shares
		// the editor's helper, like the duplicate check, so the two halves cannot
		// drift apart. Checked before the first write, too: the upserts below are
		// not in a transaction, so failing halfway would leave a partial save.
		const [badMaxScore] = invalidMaxScores(submitted);
		if (badMaxScore !== undefined) {
			return actionFail(
				400,
				'saveMetadata',
				`Maximum score for problem ${badMaxScore.number}: ${badMaxScore.error}`
			);
		}

		for (const { number, title, topics, maxScore: rawMaxScore } of submitted) {
			// Cannot fail — `invalidMaxScores` just refused everything that could.
			// Written as a branch rather than a cast so that a later change to
			// `parseMaxScore` cannot quietly slip an unvalidated value into the row.
			const parsedMaxScore = parseMaxScore(rawMaxScore);
			const maxScore = parsedMaxScore.ok ? parsedMaxScore.value : null;
			await db
				.insert(problems)
				.values({ yearId: yearRow.id, number, title, topics, maxScore })
				// `maxScore` has to appear in the `set` as well as the `values`, or the
				// field would be unclearable: blanking it in the editor would leave the
				// stored maximum in place on every existing problem.
				.onConflictDoUpdate({
					target: [problems.yearId, problems.number],
					set: { title, topics, maxScore }
				})
				.run();
		}

		// Anything the editor no longer lists was removed by the user — including a
		// problem whose number was edited, which is a delete plus an insert.
		//
		// One condition, built once and used for both statements below, so the
		// query that finds the files and the query that deletes the rows can never
		// disagree about which problems went away.
		const submittedNumbers = submitted.map((p) => p.number);
		const removed =
			submittedNumbers.length > 0
				? and(eq(problems.yearId, yearRow.id), notInArray(problems.number, submittedNumbers))
				: eq(problems.yearId, yearRow.id);

		// The FK cascade takes the problemFiles rows with the problem, and those
		// rows are the only record of which R2 keys belong to it — so the objects
		// have to go first, or they are unreachable garbage in the bucket forever.
		const orphaned = await db
			.select({ url: problemFiles.url })
			.from(problemFiles)
			.innerJoin(problems, eq(problems.id, problemFiles.problemId))
			.where(removed)
			.all();

		// Only demand a bucket when something actually has to be deleted, so a
		// storage outage cannot block the ordinary save that removes nothing.
		if (orphaned.length > 0) {
			const bucket = getBucket(platform);
			if (!bucket) return actionFail(500, 'saveMetadata', STORAGE_UNAVAILABLE);
			await deleteByUrls(
				bucket,
				orphaned.map((f) => f.url)
			);
		}

		await db.delete(problems).where(removed).run();

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
		// `slugifyLabel` deletes everything outside [a-z0-9_], so a label made only of
		// punctuation slugs to nothing and would key the object as a bare ".pdf" —
		// and every such label collides with every other one.
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

		// Reject a colliding label rather than overwriting, on two counts. An exact
		// match may carry a different extension, which would leave the old object
		// orphaned but still linked from the database. And a *different* label can
		// slug to the same key, in which case `bucket.put` below would replace the
		// earlier object silently — see `collidingLabel`. Compared in JS because
		// SQLite cannot run `slugifyLabel`, so the labels come back and are matched
		// here, with the same helper the editor uses to warn in advance.
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

		// `yearNum`, never the raw `params.year`. `parseYear` is parseInt-based and
		// there is no route matcher, so `/contribute/ipho/2020abc` resolves the
		// year-2020 row and would then write the object under `…/2020abc/…`; a
		// `%2F` in the segment could put it under an arbitrary prefix entirely.
		// Every well-formed URL emits a byte-identical key, so nothing already
		// uploaded moves — and per rule 3 `fileKey` itself stays untouched.
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
			if (!problem) return actionFail(404, 'deleteFile', 'Problem not found');

			const record = await db
				.select()
				.from(problemFiles)
				.where(and(eq(problemFiles.problemId, problem.id), eq(problemFiles.label, label)))
				.get();
			if (!record) return actionFail(404, 'deleteFile', 'File not found');

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

		return ok('deleteFile');
	}
};
