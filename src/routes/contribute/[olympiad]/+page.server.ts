import { redirect, error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { olympiads, years, problems } from '$lib/server/db/schema.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { requireOlympiadEditor } from '$lib/server/guard';
import { logActivity } from '$lib/server/activity-log.js';

const CDN_BASE_URL = 'https://cdn.phoxiv.org';

// Minimal CSV parser: handles quoted fields, embedded commas, and "" escapes.
function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	const s = text.replace(/\r\n?/g, '\n');
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inQuotes) {
			if (c === '"') {
				if (s[i + 1] === '"') {
					field += '"';
					i++;
				} else inQuotes = false;
			} else field += c;
		} else if (c === '"') inQuotes = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else field += c;
	}
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const db = locals.db;

	const olympiadRow = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();

	if (!olympiadRow) error(404, 'Olympiad not found');

	const yearRows = await db
		.select({ year: years.year })
		.from(years)
		.where(eq(years.olympiadId, params.olympiad))
		.orderBy(desc(years.year))
		.all();

	return {
		olympiad: {
			id: olympiadRow.id,
			name: olympiadRow.name,
			summary: olympiadRow.summary,
			icon: olympiadRow.icon,
			tag: olympiadRow.tag,
			descriptionMd: olympiadRow.descriptionMd ?? '',
			displayOrder: olympiadRow.displayOrder
		},
		years: yearRows.map((y) => y.year)
	};
};

export const actions: Actions = {
	updateOlympiad: async ({ request, params, locals }) => {
		requireOlympiadEditor(locals, params.olympiad);
		const db = locals.db;

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const summary = String(data.get('summary') ?? '').trim();
		const icon = String(data.get('icon') ?? '').trim();
		const tag = String(data.get('tag') ?? '').trim();
		const descriptionMd = String(data.get('description') ?? '').trim() || null;
		const displayOrderRaw = String(data.get('displayOrder') ?? '').trim();
		const displayOrder = displayOrderRaw ? parseInt(displayOrderRaw, 10) : 9999;

		if (!name || !summary || !tag) {
			return fail(400, { updateError: 'Name, summary, and tag are required' });
		}

		const validTags = ['International', 'Regional', 'National', 'Open'];
		if (!validTags.includes(tag)) {
			return fail(400, { updateError: 'Invalid tag' });
		}

		const descriptionHtml = descriptionMd
			? sanitizeHtml(await marked.parse(descriptionMd), {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
					allowedAttributes: {
						...sanitizeHtml.defaults.allowedAttributes,
						a: ['href', 'target', 'rel'],
						'*': ['class']
					}
				})
			: null;

		await db
			.update(olympiads)
			.set({
				name,
				summary,
				icon,
				tag: tag as 'International' | 'Regional' | 'National' | 'Open',
				descriptionMd,
				descriptionHtml,
				displayOrder: isNaN(displayOrder) ? 9999 : displayOrder
			})
			.where(eq(olympiads.id, params.olympiad))
			.run();

		await logActivity(db, locals.user, 'update_olympiad', `Updated metadata for "${name}"`, {
			olympiadId: params.olympiad
		});

		return { success: true, action: 'updateOlympiad' as const };
	},

	uploadIcon: async ({ request, params, platform, locals }) => {
		requireOlympiadEditor(locals, params.olympiad);
		const db = locals.db;
		const r2 = platform?.env.FILES;
		if (!r2) return fail(500, { uploadIconError: 'Storage unavailable' });

		const data = await request.formData();
		const file = data.get('iconFile') as File | null;

		if (!file || file.size === 0) return fail(400, { uploadIconError: 'No file provided' });

		const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — icons should be small
		if (file.size > MAX_BYTES) return fail(400, { uploadIconError: 'File too large (max 2 MB)' });

		const ALLOWED_EXTS = new Set(['svg', 'png', 'jpg', 'jpeg', 'webp', 'avif']);
		const ALLOWED_TYPES: Record<string, string> = {
			svg: 'image/svg+xml',
			png: 'image/png',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			webp: 'image/webp',
			avif: 'image/avif'
		};

		const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
		if (!ALLOWED_EXTS.has(ext)) {
			return fail(400, {
				uploadIconError: 'Unsupported file type. Use SVG, PNG, JPG, WebP, or AVIF.'
			});
		}
		const contentType = ALLOWED_TYPES[ext] ?? 'application/octet-stream';

		const key = `icons/olympiads/${params.olympiad}.${ext}`;

		// Delete any existing icon files for this olympiad (all extensions) to avoid stale files
		for (const oldExt of ALLOWED_EXTS) {
			if (oldExt === ext) continue;
			try {
				await r2.delete(`icons/olympiads/${params.olympiad}.${oldExt}`);
			} catch {
				// Ignore — file likely doesn't exist
			}
		}

		await r2.put(key, file.stream(), {
			httpMetadata: { contentType }
		});

		const iconUrl = `${CDN_BASE_URL}/${key}`;

		await db
			.update(olympiads)
			.set({ icon: iconUrl })
			.where(eq(olympiads.id, params.olympiad))
			.run();

		await logActivity(db, locals.user, 'upload_icon', 'Uploaded a new icon', {
			olympiadId: params.olympiad
		});

		return { success: true, action: 'uploadIcon' as const, iconUrl };
	},

	removeIcon: async ({ params, locals }) => {
		requireOlympiadEditor(locals, params.olympiad);
		const db = locals.db;

		// Clear to empty string so the fallback (emoji/flag) takes over
		await db.update(olympiads).set({ icon: '' }).where(eq(olympiads.id, params.olympiad)).run();

		await logActivity(db, locals.user, 'remove_icon', 'Removed the uploaded icon', {
			olympiadId: params.olympiad
		});

		return { success: true, action: 'removeIcon' as const };
	},

	// Creates the year record if it doesn't exist yet, then takes the user straight to it.
	// olympiadId is fixed to the current page, unlike the top-level /contribute selectYear action.
	selectYear: async ({ request, params, locals }) => {
		requireOlympiadEditor(locals, params.olympiad);
		const db = locals.db;
		const data = await request.formData();
		const yearRaw = String(data.get('year') ?? '').trim();

		const year = parseInt(yearRaw, 10);
		if (isNaN(year) || year < 1900 || year > 2100) {
			return fail(400, { selectError: 'Please enter a valid year (1900-2100)' });
		}

		const existingYear = await db
			.select({ id: years.id })
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, year)))
			.get();

		await db
			.insert(years)
			.values({ olympiadId: params.olympiad, year, notes: '[]', extraLinks: '[]' })
			.onConflictDoNothing()
			.run();

		if (!existingYear) {
			await logActivity(db, locals.user, 'add_year', `Added year ${year}`, {
				olympiadId: params.olympiad,
				year
			});
		}

		redirect(303, `/contribute/${params.olympiad}/${year}`);
	},
	importTitles: async ({ request, params, locals }) => {
			requireOlympiadEditor(locals, params.olympiad);
			const db = locals.db;

			const data = await request.formData();
			const file = data.get('csvFile') as File | null;
			if (!file || file.size === 0) return fail(400, { importError: 'No file provided' });

			const MAX_BYTES = 1 * 1024 * 1024; // 1 MB — ample for a titles CSV
			if (file.size > MAX_BYTES) return fail(400, { importError: 'File too large (max 1 MB)' });

			const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
			if (ext !== 'csv') return fail(400, { importError: 'Please upload a .csv file' });

			const rows = parseCsv(await file.text());
			if (rows.length < 2) return fail(400, { importError: 'CSV appears to be empty' });

			// Resolve columns by header name so column order isn't assumed.
			const header = rows[0].map((h) => h.trim().toLowerCase());
			const col = {
				olympiad: header.indexOf('olympiad'),
				year: header.indexOf('year'),
				number: header.indexOf('number'),
				title: header.indexOf('title')
			};
			if (col.year === -1 || col.number === -1 || col.title === -1) {
				return fail(400, { importError: 'CSV must have "year", "number", and "title" columns' });
			}

			type Entry = { year: number; number: string; title: string | null };
			const entries: Entry[] = [];
			let skippedOtherOlympiad = 0;
			let skippedInvalid = 0;
			for (let i = 1; i < rows.length; i++) {
				const r = rows[i];
				if (r.every((c) => c.trim() === '')) continue; // blank line
				if (col.olympiad !== -1) {
					const olympiadId = (r[col.olympiad] ?? '').trim();
					if (olympiadId && olympiadId !== params.olympiad) {
						skippedOtherOlympiad++;
						continue;
					}
				}
				const yearNum = parseInt((r[col.year] ?? '').trim(), 10);
				const number = (r[col.number] ?? '').trim();
				const title = (r[col.title] ?? '').trim() || null;
				if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100 || !number) {
					skippedInvalid++;
					continue;
				}
				entries.push({ year: yearNum, number, title });
			}

			if (entries.length === 0) {
				return fail(400, { importError: 'No valid rows found for this olympiad' });
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
				const inserted = await db
					.insert(years)
					.values({ olympiadId: params.olympiad, year: y, notes: '[]', extraLinks: '[]' })
					.returning({ id: years.id })
					.get();
				yearIdByYear.set(y, inserted.id);
				yearsCreated++;
			}

			// Existing problems for the involved years -> Map<"yearId:number", {id, title}>.
			const involvedYearIds = [...new Set(entries.map((e) => yearIdByYear.get(e.year)!))];
			const existingProblems = await db
				.select({ id: problems.id, yearId: problems.yearId, number: problems.number, title: problems.title })
				.from(problems)
				.where(inArray(problems.yearId, involvedYearIds))
				.all();
			const problemByKey = new Map<string, { id: number; title: string | null }>();
			for (const p of existingProblems) {
				problemByKey.set(`${p.yearId}:${p.number}`, { id: p.id, title: p.title });
			}

			let created = 0;
			let filled = 0;
			let kept = 0;
			for (const e of entries) {
				const yearId = yearIdByYear.get(e.year)!;
				const key = `${yearId}:${e.number}`;
				const existing = problemByKey.get(key);
				if (!existing) {
					const inserted = await db
						.insert(problems)
						.values({ yearId, number: e.number, title: e.title })
						.returning({ id: problems.id })
						.get();
					problemByKey.set(key, { id: inserted.id, title: e.title });
					created++;
				} else if ((existing.title === null || existing.title === '') && e.title) {
					// Problem exists but has no title yet — fill it in.
					await db.update(problems).set({ title: e.title }).where(eq(problems.id, existing.id)).run();
					existing.title = e.title;
					filled++;
				} else {
					// Title already present (or CSV title empty) — keep the existing one.
					kept++;
				}
			}

			await logActivity(
				db,
				locals.user,
				'import_titles',
				`Imported titles from CSV (${created} created, ${filled} filled, ${kept} kept` +
					`${yearsCreated ? `, ${yearsCreated} years added` : ''})`,
				{ olympiadId: params.olympiad }
			);

			return {
				success: true,
				action: 'importTitles' as const,
				stats: { created, filled, kept, yearsCreated, skippedOtherOlympiad, skippedInvalid }
			};
		}
};