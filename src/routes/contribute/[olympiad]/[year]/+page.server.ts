import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq, and } from 'drizzle-orm';
import { olympiads, years, yearFiles, problems, problemFiles } from '$lib/server/db/schema.js';
import { requireAdmin } from '$lib/server/guard';

const CDN_BASE_URL = 'https://cdn.phoxiv.org';

export const load: PageServerLoad = async ({ params, locals }) => {
	const db = locals.db;
	const yearNum = parseInt(params.year, 10);
	if (isNaN(yearNum)) error(400, 'Invalid year');

	const olympiadRow = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();
	if (!olympiadRow) error(404, 'Olympiad not found');

	const yearRow = await db
		.select()
		.from(years)
		.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
		.get();
	if (!yearRow) error(404, 'Year not found');

	const [yearFileRows, problemRows] = await Promise.all([
		db.select().from(yearFiles).where(eq(yearFiles.yearId, yearRow.id)).orderBy(yearFiles.id).all(),
		db
			.select()
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			.where(eq(problems.yearId, yearRow.id))
			.orderBy(problems.id, problemFiles.id)
			.all()
	]);

	const problemMap = new Map<
		number,
		{ id: number; number: string; title: string | null; files: { label: string; url: string }[] }
	>();
	for (const row of problemRows) {
		const p = row.problems;
		if (!problemMap.has(p.id)) {
			problemMap.set(p.id, { id: p.id, number: p.number, title: p.title, files: [] });
		}
		if (row.problem_files) {
			problemMap
				.get(p.id)!
				.files.push({ label: row.problem_files.label, url: row.problem_files.url });
		}
	}

	return {
		olympiad: {
			id: olympiadRow.id,
			name: olympiadRow.name
		},
		year: {
			id: yearRow.id,
			year: yearRow.year,
			notes: JSON.parse(yearRow.notes) as string[],
			extraLinks: JSON.parse(yearRow.extraLinks) as { label: string; url: string }[]
		},
		yearFiles: yearFileRows.map((f) => ({ label: f.label, url: f.url })),
		problems: [...problemMap.values()]
	};
};

export const actions: Actions = {
	saveMetadata: async ({ request, params, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		const notes = data
			.getAll('note')
			.map((n) => String(n).trim())
			.filter(Boolean);
		const linkLabels = data.getAll('linkLabel').map(String);
		const linkUrls = data.getAll('linkUrl').map(String);
		const extraLinks = linkLabels
			.map((label, i) => ({ label: label.trim(), url: (linkUrls[i] ?? '').trim() }))
			.filter((l) => l.label && l.url);

		await db
			.update(years)
			.set({ notes: JSON.stringify(notes), extraLinks: JSON.stringify(extraLinks) })
			.where(eq(years.id, yearRow.id))
			.run();

		const rawNumbers = data.getAll('problemNumber').map((n) => String(n).trim());
		const rawTitles = data.getAll('problemTitle').map(String);
		const problemPairs = rawNumbers
			.map((number, i) => ({ number, title: (rawTitles[i] ?? '').trim() || null }))
			.filter((p) => p.number);

		for (const { number, title } of problemPairs) {
			await db
				.insert(problems)
				.values({ yearId: yearRow.id, number, title })
				.onConflictDoUpdate({
					target: [problems.yearId, problems.number],
					set: { title }
				})
				.run();
		}

		const submittedNumbers = problemPairs.map((p) => p.number);
		const existing = await db
			.select({ id: problems.id, number: problems.number })
			.from(problems)
			.where(eq(problems.yearId, yearRow.id))
			.all();
		for (const p of existing) {
			if (!submittedNumbers.includes(p.number)) {
				await db.delete(problems).where(eq(problems.id, p.id)).run();
			}
		}

		return { success: true, action: 'saveMetadata' as const };
	},

	uploadFile: async ({ request, params, platform, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const r2 = platform?.env.FILES;
		if (!r2) return fail(500, { error: 'Storage unavailable' });
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const label = String(data.get('label') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim();
		const problemNumber = String(data.get('problemNumber') ?? '').trim();
		const file = data.get('file') as File | null;

		if (!file || file.size === 0) return fail(400, { error: 'No file provided' });

		const MAX_BYTES = 50 * 1024 * 1024; // 50 MB file size limit
		if (file.size > MAX_BYTES) return fail(400, { error: 'File too large (max 50 MB)' });

		if (!label) return fail(400, { error: 'Label is required' });
		if (!scope) return fail(400, { error: 'Scope is required' });
		if (scope === 'problem' && !problemNumber)
			return fail(400, { error: 'Problem number required' });
		if (label.includes('/')) return fail(400, { error: 'Label cannot include /' });

		const ALLOWED_EXTS = new Set(['pdf', 'xlsx', 'zip', 'doc', 'docx', 'htm', 'html']);
		const ALLOWED_TYPES: Record<string, string> = {
			pdf: 'application/pdf',
			xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			zip: 'application/zip',
			doc: 'application/msword',
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			htm: 'text/html',
			html: 'text/html'
		};

		const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
		if (!ALLOWED_EXTS.has(ext)) return fail(400, { error: 'File type not allowed' });
		// Don't trust the MIME type sent by the client
		const contentType = ALLOWED_TYPES[ext] ?? 'application/octet-stream';

		const slugLabel = label
			.toLowerCase()
			.replace(/\s+/g, '_')
			.replace(/[^a-z0-9_]/g, '');
		const key =
			scope === 'year'
				? `olympiads/${params.olympiad}/${params.year}/${slugLabel}.${ext}`
				: `olympiads/${params.olympiad}/${params.year}/${problemNumber}/${slugLabel}.${ext}`;

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		let problemRow: typeof problems.$inferSelect | undefined;

		if (scope === 'problem') {
			problemRow = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (!problemRow)
				return fail(404, { error: `Problem ${problemNumber} not found — save metadata first` });

			// Delete old R2 file if replacing
			const existing = await db
				.select({ url: problemFiles.url })
				.from(problemFiles)
				.where(and(eq(problemFiles.problemId, problemRow.id), eq(problemFiles.label, label)))
				.get();
			if (existing?.url.startsWith(CDN_BASE_URL + '/')) {
				await r2.delete(existing.url.slice(CDN_BASE_URL.length + 1));
			}
		} else {
			// Delete old R2 file if replacing
			const existing = await db
				.select({ url: yearFiles.url })
				.from(yearFiles)
				.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.label, label)))
				.get();
			if (existing?.url.startsWith(CDN_BASE_URL + '/')) {
				await r2.delete(existing.url.slice(CDN_BASE_URL.length + 1));
			}
		}

		await r2.put(key, file.stream(), {
			httpMetadata: { contentType: contentType }
		});

		const url = `${CDN_BASE_URL}/${key}`;

		if (scope === 'year') {
			await db
				.insert(yearFiles)
				.values({ yearId: yearRow.id, label, url })
				.onConflictDoUpdate({
					target: [yearFiles.yearId, yearFiles.label],
					set: { url }
				})
				.run();
		} else {
			await db
				.insert(problemFiles)
				.values({ problemId: problemRow!.id, label, url })
				.onConflictDoUpdate({
					target: [problemFiles.problemId, problemFiles.label],
					set: { url }
				})
				.run();
		}

		return { success: true, action: 'uploadFile' as const };
	},

	deleteFile: async ({ request, params, platform, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const r2 = platform?.env.FILES;
		if (!r2) return fail(500, { error: 'Storage unavailable' });
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const label = String(data.get('label') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim();
		const problemNumber = String(data.get('problemNumber') ?? '').trim();

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		const record = await db
			.select()
			.from(yearFiles)
			.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.label, label)))
			.get();
		if (!record) return fail(404, { error: 'File not found' });

		// Delete from R2 using only the DB-stored URL, not the submitted one
		if (record.url.startsWith(CDN_BASE_URL + '/')) {
			await r2.delete(record.url.slice(CDN_BASE_URL.length + 1));
		}

		await db.delete(yearFiles).where(eq(yearFiles.id, record.id)).run();

		if (scope === 'year') {
			await db
				.delete(yearFiles)
				.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.label, label)))
				.run();
		} else {
			const problem = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (problem) {
				await db
					.delete(problemFiles)
					.where(and(eq(problemFiles.problemId, problem.id), eq(problemFiles.label, label)))
					.run();
			}
		}

		return { success: true, action: 'deleteFile' as const };
	}
};
