import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq, and } from 'drizzle-orm';
import { olympiads, years, yearFiles, problems, problemFiles } from '$lib/server/db/schema.js';

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
		db.select().from(yearFiles).where(eq(yearFiles.yearId, yearRow.id)).all(),
		db
			.select()
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			.where(eq(problems.yearId, yearRow.id))
			.orderBy(problems.id)
			.all()
	]);

	const problemMap = new Map<
		number,
		{ id: number; number: string; title: string | null; files: Record<string, string> }
	>();
	for (const row of problemRows) {
		const p = row.problems;
		if (!problemMap.has(p.id)) {
			problemMap.set(p.id, { id: p.id, number: p.number, title: p.title, files: {} });
		}
		if (row.problem_files) {
			problemMap.get(p.id)!.files[row.problem_files.fileType] = row.problem_files.url;
		}
	}

	return {
		olympiad: {
			id: olympiadRow.id,
			name: olympiadRow.name,
			yearFileTypes: JSON.parse(olympiadRow.yearFileTypes) as Record<string, { label: string }>,
			problemFileTypes: JSON.parse(olympiadRow.problemFileTypes) as Record<
				string,
				{ label: string }
			>
		},
		year: {
			id: yearRow.id,
			year: yearRow.year,
			notes: JSON.parse(yearRow.notes) as string[],
			extraLinks: JSON.parse(yearRow.extraLinks) as { label: string; url: string }[]
		},
		yearFiles: Object.fromEntries(yearFileRows.map((f) => [f.fileType, f.url])) as Record<
			string,
			string
		>,
		problems: [...problemMap.values()]
	};
};

export const actions: Actions = {
	saveMetadata: async ({ request, params, locals }) => {
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
		const db = locals.db;
		const r2 = platform?.env.FILES;
		if (!r2) return fail(500, { error: 'Storage unavailable' });
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const fileType = String(data.get('fileType') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim();
		const problemNumber = String(data.get('problemNumber') ?? '').trim();
		const file = data.get('file') as File | null;

		if (!file || file.size === 0) return fail(400, { error: 'No file provided' });
		if (!fileType || !scope) return fail(400, { error: 'Missing required fields' });
		if (scope === 'problem' && !problemNumber)
			return fail(400, { error: 'Problem number required' });

		const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
		const key =
			scope === 'year'
				? `olympiads/${params.olympiad}/${params.year}/${fileType}.${ext}`
				: `olympiads/${params.olympiad}/${params.year}/${problemNumber}_${fileType}.${ext}`;

		// bug in miniflare https://github.com/cloudflare/workers-sdk/issues/4373
		await r2.put(key, file.stream(), {
			httpMetadata: { contentType: file.type || 'application/pdf' }
		});

		const url = `${CDN_BASE_URL}/${key}`;

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		if (scope === 'year') {
			await db
				.insert(yearFiles)
				.values({ yearId: yearRow.id, fileType, url })
				.onConflictDoUpdate({
					target: [yearFiles.yearId, yearFiles.fileType],
					set: { url }
				})
				.run();
		} else {
			const problem = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (!problem)
				return fail(404, { error: `Problem ${problemNumber} not found — save metadata first` });
			await db
				.insert(problemFiles)
				.values({ problemId: problem.id, fileType, url })
				.onConflictDoUpdate({
					target: [problemFiles.problemId, problemFiles.fileType],
					set: { url }
				})
				.run();
		}

		return { success: true, action: 'uploadFile' as const };
	},

	deleteFile: async ({ request, params, platform, locals }) => {
		const db = locals.db;
		const r2 = platform?.env.FILES;
		if (!r2) return fail(500, { error: 'Storage unavailable' });
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const fileType = String(data.get('fileType') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim();
		const problemNumber = String(data.get('problemNumber') ?? '').trim();
		const url = String(data.get('url') ?? '').trim();

		if (url.startsWith(CDN_BASE_URL + '/')) {
			await r2.delete(url.slice(CDN_BASE_URL.length + 1));
		}

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		if (scope === 'year') {
			await db
				.delete(yearFiles)
				.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.fileType, fileType)))
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
					.where(and(eq(problemFiles.problemId, problem.id), eq(problemFiles.fileType, fileType)))
					.run();
			}
		}

		return { success: true, action: 'deleteFile' as const };
	}
};
