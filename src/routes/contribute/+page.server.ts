import { redirect, fail } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { olympiads, years } from '$lib/server/db/schema.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { requireAdmin } from '$lib/server/guard';

export const load = async ({ locals }) => {
	const db = locals.db;
	const rows = await db
		.select({ id: olympiads.id, name: olympiads.name })
		.from(olympiads)
		.orderBy(asc(olympiads.displayOrder), asc(olympiads.id))
		.all();
	return { olympiads: rows };
};

export const actions = {
	// Navigate to an existing olympiad+year, creating the year record if it doesn't exist yet
	selectYear: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const data = await request.formData();
		const olympiadId = String(data.get('olympiadId') ?? '').trim();
		const year = parseInt(String(data.get('year') ?? ''), 10);
		if (!olympiadId || isNaN(year) || year < 1900 || year > 2100) {
			return fail(400, { selectError: 'Valid olympiad and year are required' });
		}
		await db
			.insert(years)
			.values({ olympiadId, year, notes: '[]', extraLinks: '[]' })
			.onConflictDoNothing()
			.run();
		redirect(303, `/contribute/${olympiadId}/${year}`);
	},

	// Create a brand new olympiad, then go straight to editing its first year
	createOlympiad: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const data = await request.formData();
		const id = String(data.get('id') ?? '')
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-');
		const name = String(data.get('name') ?? '').trim();
		const summary = String(data.get('summary') ?? '').trim();
		const icon = String(data.get('icon') ?? '').trim();
		const tag = String(data.get('tag') ?? '').trim();
		const year = parseInt(String(data.get('year') ?? ''), 10);
		const descriptionMd = String(data.get('description') ?? '').trim() || null;
		if (!id || !name || !summary || !tag || isNaN(year)) {
			return fail(400, { createError: 'All required fields must be filled in' });
		}
		const validTags = ['International', 'Regional', 'National', 'Open'];
		if (!validTags.includes(tag)) return fail(400, { createError: 'Invalid tag' });
		const descriptionHtml = descriptionMd
			? sanitizeHtml(await marked.parse(descriptionMd), {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
					allowedAttributes: {
						...sanitizeHtml.defaults.allowedAttributes,
						img: ['src', 'alt', 'class'],
						a: ['href', 'target', 'rel'],
						'*': ['class']
					}
				})
			: null;
		try {
			await db
				.insert(olympiads)
				.values({
					id,
					name,
					summary,
					icon,
					tag: tag as 'International' | 'Regional' | 'National' | 'Open',
					descriptionMd,
					descriptionHtml
				})
				.run();
		} catch {
			return fail(400, { createError: `An olympiad with the ID "${id}" already exists` });
		}
		await db.insert(years).values({ olympiadId: id, year, notes: '[]', extraLinks: '[]' }).run();
		redirect(303, `/contribute/${id}/${year}`);
	}
};