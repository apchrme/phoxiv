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
	// Authorise before reading. The layout guard establishes only that this is a
	// contributor, not that they may edit *this* olympiad — without this the
	// editor for any olympiad was a URL away for any contributor, unrendered
	// `descriptionMd` draft and `displayOrder` included. Permission first,
	// existence second, matching `titles.csv/+server.ts`.
	const { db } = requireOlympiadEditor(locals, params.olympiad);
	const olympiadRow = await requireOlympiad(db, params.olympiad);

	return {
		// The editor's own view of an olympiad: unlike the public `OlympiadEntry`
		// it carries the unrendered Markdown draft and the display order.
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

		// The emoji field is `disabled` whenever an uploaded image icon is in force,
		// and browsers omit disabled controls from FormData. An absent `icon` therefore
		// means "the form had nothing to say about the icon", not "clear it" — writing
		// the empty string here used to silently delete the uploaded icon's URL while
		// the page cheerfully toasted "Olympiad updated". Keying off presence rather
		// than value keeps the fix independent of how the form is split into
		// components; a hidden input would only work for as long as it stayed a DOM
		// descendant of this form.
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

		// An action does not run the page load, so the load's 404 does not cover
		// this, and an admin passes the guard for *any* id: `POST
		// /contribute/nope?/uploadIcon` used to reach the `put` below with nothing
		// having checked that `nope` exists. R2 has no foreign keys and nothing
		// sweeps the bucket, so the object it wrote was unreachable for good — the
		// `update` matched no row, so no `icon` column ever pointed at it, and
		// `deleteStaleIcons` only ever runs for an id someone uploads to a second
		// time. `getOlympiad` and not `requireOlympiad`, per rule 6: a 404 page
		// would discard the description draft in the other half of this form.
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

		// Cleared to an empty string rather than NULL so the emoji/flag fallback
		// in OlympiadIcon takes over. The R2 object is left in place; re-uploading
		// overwrites it, and an orphan icon costs nothing.
		await db.update(olympiads).set({ icon: '' }).where(eq(olympiads.id, params.olympiad)).run();

		await logActivity(db, user, 'remove_icon', 'Removed the uploaded icon', {
			olympiadId: params.olympiad
		});

		return ok('removeIcon');
	},

	/**
	 * Same as the top-level `/contribute` selectYear, except the olympiad is
	 * fixed to the current page rather than submitted.
	 */
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
	 * Bulk-imports problem numbers, titles, topics and maximum scores from the CSV
	 * produced by `titles.csv`.
	 *
	 * Fill-only by design: an existing problem is never overwritten, only
	 * completed. A re-import can therefore not clobber work done through the year
	 * editor, which makes the round-trip safe to repeat.
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

		// Still only three required columns: "topics" and "max_score" are both
		// optional, so every CSV exported before either existed still imports.
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
			// The "topics" column is optional, so older CSVs still import cleanly.
			// Unrecognised topic names are ignored rather than failing the import.
			const topics = parseTopicsCsvCell(r.topics);
			if (year === null || !number) {
				skippedInvalid++;
				continue;
			}
			// So is "max_score". An unreadable cell is dropped rather than failing the
			// whole import — the same tolerance `parseTopicsCsvCell` shows an
			// unrecognised topic — but it is counted and reported back, so a typo in
			// one cell of a thousand-row spreadsheet is visible instead of silent.
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
			// Fill-only like the two above: a maximum already set through the year
			// editor is never replaced by one from a spreadsheet.
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
