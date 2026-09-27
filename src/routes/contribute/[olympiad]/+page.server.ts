import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq, inArray } from 'drizzle-orm';
import { olympiads, problems, years } from '$lib/server/db';
import { parse } from 'csv-parse/sync';
import { requireOlympiadEditor } from '$lib/server/guard';
import { logActivity } from '$lib/server/activity-log';
import { renderMarkdownOrNull } from '$lib/server/markdown';
import { getOlympiad, OLYMPIAD_NOT_FOUND, requireOlympiad } from '$lib/server/db/queries/olympiads';
import { ensureYear, insertYear, listYearNumbers } from '$lib/server/db/queries/years';
import {
	actionFail,
	field,
	fieldOrNull,
	fileField,
	intField,
	ok,
	parseYear,
	YEAR_RANGE_ERROR
} from '$lib/server/forms';
import {
	cdnUrl,
	deleteStaleIcons,
	getBucket,
	iconKey,
	STORAGE_UNAVAILABLE
} from '$lib/server/storage';
import { validateUpload } from '$lib/server/uploads';
import { CSV_UPLOAD, ICON_UPLOAD } from '$lib/uploads';
import { isOlympiadTag } from '$lib/types';
import type { ProblemTopic } from '$lib/types';
import { parseTopics, parseTopicsCsvCell, serializeTopics } from '$lib/utils/topics';
import { parseMaxScore } from '$lib/progress';

/** Default `displayOrder` for an olympiad that hasn't been positioned yet. */
const DEFAULT_DISPLAY_ORDER = 9999;

export const load: PageServerLoad = async ({ params, locals }) => {
	// Authorise before reading: the layout guard only checks the role, not this
	// olympiad. Permission first, existence second.
	const { db } = requireOlympiadEditor(locals, params.olympiad);
	const olympiadRow = await requireOlympiad(db, params.olympiad);

	return {
		// Unlike the public `OlympiadEntry`, includes the Markdown source and display order.
		olympiad: {
			id: olympiadRow.id,
			name: olympiadRow.name,
			summary: olympiadRow.summary,
			icon: olympiadRow.icon,
			tag: olympiadRow.tag,
			descriptionMd: olympiadRow.descriptionMd ?? '',
			displayOrder: olympiadRow.displayOrder
		},
		years: await listYearNumbers(db, params.olympiad)
	};
};

export const actions: Actions = {
	updateOlympiad: async ({ request, params, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);

		const data = await request.formData();
		const name = field(data, 'name');
		const summary = field(data, 'summary');
		const tag = field(data, 'tag');
		const descriptionMd = fieldOrNull(data, 'description');
		const displayOrder = intField(data, 'displayOrder', DEFAULT_DISPLAY_ORDER);

		if (!name || !summary || !tag) {
			return actionFail(400, 'updateOlympiad', 'Name, summary, and tag are required');
		}
		if (!isOlympiadTag(tag)) return actionFail(400, 'updateOlympiad', 'Invalid tag');

		// The emoji field is `disabled` while an uploaded icon is set, so it's
		// missing from FormData. Missing means "leave the icon alone". Don't write
		// `''` here: that silently deleted uploaded icons.
		const iconPatch = data.has('icon') ? { icon: field(data, 'icon') } : {};

		await db
			.update(olympiads)
			.set({
				name,
				summary,
				...iconPatch,
				tag,
				descriptionMd,
				descriptionHtml: await renderMarkdownOrNull(descriptionMd),
				displayOrder
			})
			.where(eq(olympiads.id, params.olympiad))
			.run();

		await logActivity(db, user, 'update_olympiad', `Updated metadata for "${name}"`, {
			olympiadId: params.olympiad
		});

		return ok('updateOlympiad');
	},

	uploadIcon: async ({ request, params, platform, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const bucket = getBucket(platform);
		if (!bucket) return actionFail(500, 'uploadIcon', STORAGE_UNAVAILABLE);

		// Actions don't run the load, and admins pass the guard for any id, so check
		// the olympiad exists or the upload leaves an orphaned R2 object.
		// `actionFail`, not `requireOlympiad`'s `error()`, which would discard the
		// description draft on the same page.
		const olympiad = await getOlympiad(db, params.olympiad);
		if (!olympiad) return actionFail(404, 'uploadIcon', OLYMPIAD_NOT_FOUND);

		const data = await request.formData();
		const validated = validateUpload(fileField(data, 'iconFile'), ICON_UPLOAD);
		if (!validated.ok) return actionFail(400, 'uploadIcon', validated.error);

		const { file, ext, contentType } = validated.value;
		const key = iconKey(params.olympiad, ext);

		// The key embeds the extension, so a .png replacing a .svg would otherwise
		// leave the old file live on the CDN.
		await deleteStaleIcons(bucket, params.olympiad, ext, ICON_UPLOAD.exts);
		await bucket.put(key, file.stream(), { httpMetadata: { contentType } });

		const iconUrl = cdnUrl(key);
		await db
			.update(olympiads)
			.set({ icon: iconUrl })
			.where(eq(olympiads.id, params.olympiad))
			.run();

		await logActivity(db, user, 'upload_icon', 'Uploaded a new icon', {
			olympiadId: params.olympiad
		});

		return ok('uploadIcon', { iconUrl });
	},

	removeIcon: async ({ params, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);

		// '' so OlympiadIcon falls back. The R2 object is left; a re-upload replaces it.
		await db.update(olympiads).set({ icon: '' }).where(eq(olympiads.id, params.olympiad)).run();

		await logActivity(db, user, 'remove_icon', 'Removed the uploaded icon', {
			olympiadId: params.olympiad
		});

		return ok('removeIcon');
	},

	/** Like `/contribute`'s selectYear, with the olympiad taken from the URL. */
	selectYear: async ({ request, params, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);
		const data = await request.formData();

		const year = parseYear(field(data, 'year'));
		if (year === null) return actionFail(400, 'selectYear', YEAR_RANGE_ERROR);

		const { created } = await ensureYear(db, params.olympiad, year);
		if (created) {
			await logActivity(db, user, 'add_year', `Added year ${year}`, {
				olympiadId: params.olympiad,
				year
			});
		}

		redirect(303, `/contribute/${params.olympiad}/${year}`);
	},

	/**
	 * Bulk-imports problems from a `titles.csv`-format CSV. Fill-only: existing
	 * values are never overwritten, so re-importing is safe.
	 */
	importTitles: async ({ request, params, locals }) => {
		const { db, user } = requireOlympiadEditor(locals, params.olympiad);

		const data = await request.formData();
		const validated = validateUpload(fileField(data, 'csvFile'), CSV_UPLOAD);
		if (!validated.ok) return actionFail(400, 'importTitles', validated.error);

		type Row = Record<string, string>;
		let records: Row[];
		try {
			records = parse(await validated.value.file.text(), {
				columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
				skip_empty_lines: true,
				trim: true,
				relax_column_count: true
			}) as Row[];
		} catch {
			return actionFail(400, 'importTitles', 'Could not parse CSV file');
		}

		if (records.length === 0) return actionFail(400, 'importTitles', 'CSV appears to be empty');

		// "topics" and "max_score" are optional, so older CSVs still import.
		const header = Object.keys(records[0]);
		if (!header.includes('year') || !header.includes('number') || !header.includes('title')) {
			return actionFail(400, 'importTitles', 'CSV must have "year", "number", and "title" columns');
		}

		type Entry = {
			year: number;
			number: string;
			title: string | null;
			topics: ProblemTopic[];
			maxScore: number | null;
		};
		const entries: Entry[] = [];
		let skippedInvalid = 0;
		let badMaxScores = 0;
		for (const r of records) {
			const year = parseYear((r.year ?? '').trim());
			const number = (r.number ?? '').trim();
			const title = (r.title ?? '').trim() || null;
			// Unrecognised topic names are ignored.
			const topics = parseTopicsCsvCell(r.topics);
			if (year === null || !number) {
				skippedInvalid++;
				continue;
			}
			// An unreadable max score is dropped but counted and reported back.
			const parsedMaxScore = parseMaxScore(r.max_score ?? '');
			if (!parsedMaxScore.ok) badMaxScores++;
			entries.push({
				year,
				number,
				title,
				topics,
				maxScore: parsedMaxScore.ok ? parsedMaxScore.value : null
			});
		}

		if (entries.length === 0) {
			return actionFail(400, 'importTitles', 'No valid rows found for this olympiad');
		}

		// Resolve (and create) the year rows -> Map<yearNumber, yearId>.
		const existingYears = await db
			.select({ id: years.id, year: years.year })
			.from(years)
			.where(eq(years.olympiadId, params.olympiad))
			.all();
		const yearIdByYear = new Map<number, number>(existingYears.map((y) => [y.year, y.id]));

		let yearsCreated = 0;
		for (const y of new Set(entries.map((e) => e.year))) {
			if (yearIdByYear.has(y)) continue;
			yearIdByYear.set(y, await insertYear(db, params.olympiad, y));
			yearsCreated++;
		}

		// Existing problems for the involved years -> Map<"yearId:number", …>.
		const involvedYearIds = [...new Set(entries.map((e) => yearIdByYear.get(e.year)!))];
		const existingProblems = await db
			.select({
				id: problems.id,
				yearId: problems.yearId,
				number: problems.number,
				title: problems.title,
				topics: problems.topics,
				maxScore: problems.maxScore
			})
			.from(problems)
			.where(inArray(problems.yearId, involvedYearIds))
			.all();
		const problemByKey = new Map<
			string,
			{ id: number; title: string | null; topics: ProblemTopic[]; maxScore: number | null }
		>();
		for (const p of existingProblems) {
			problemByKey.set(`${p.yearId}:${p.number}`, {
				id: p.id,
				title: p.title,
				topics: parseTopics(p.topics),
				maxScore: p.maxScore
			});
		}

		let created = 0;
		let filled = 0;
		let topicsFilled = 0;
		let maxScoresFilled = 0;
		let kept = 0;
		for (const e of entries) {
			const yearId = yearIdByYear.get(e.year)!;
			const key = `${yearId}:${e.number}`;
			const existing = problemByKey.get(key);
			if (!existing) {
				const inserted = await db
					.insert(problems)
					.values({
						yearId,
						number: e.number,
						title: e.title,
						topics: serializeTopics(e.topics),
						maxScore: e.maxScore
					})
					.returning({ id: problems.id })
					.get();
				problemByKey.set(key, {
					id: inserted.id,
					title: e.title,
					topics: e.topics,
					maxScore: e.maxScore
				});
				created++;
				continue;
			}

			// The problem already exists — only fill in what it's missing.
			const patch: { title?: string; topics?: string; maxScore?: number } = {};
			if ((existing.title === null || existing.title === '') && e.title) patch.title = e.title;
			if (existing.topics.length === 0 && e.topics.length > 0) {
				patch.topics = serializeTopics(e.topics);
			}
			if (existing.maxScore === null && e.maxScore !== null) patch.maxScore = e.maxScore;

			if (patch.title === undefined && patch.topics === undefined && patch.maxScore === undefined) {
				// Nothing missing (or nothing offered by the CSV) — leave it alone.
				kept++;
				continue;
			}

			await db.update(problems).set(patch).where(eq(problems.id, existing.id)).run();
			if (patch.title !== undefined) {
				existing.title = patch.title;
				filled++;
			}
			if (patch.topics !== undefined) {
				existing.topics = e.topics;
				topicsFilled++;
			}
			if (patch.maxScore !== undefined) {
				existing.maxScore = patch.maxScore;
				maxScoresFilled++;
			}
		}

		await logActivity(
			db,
			user,
			'import_titles',
			`Imported titles from CSV (${created} created, ${filled} titles filled, ` +
				`${topicsFilled} topics filled, ${maxScoresFilled} max scores filled, ${kept} kept` +
				`${yearsCreated ? `, ${yearsCreated} years added` : ''}` +
				`${badMaxScores ? `, ${badMaxScores} unreadable max scores ignored` : ''})`,
			{ olympiadId: params.olympiad }
		);

		return ok('importTitles', {
			stats: {
				created,
				filled,
				topicsFilled,
				maxScoresFilled,
				kept,
				yearsCreated,
				skippedInvalid,
				badMaxScores
			}
		});
	}
};
