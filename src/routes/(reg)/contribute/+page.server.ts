import { redirect, fail } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { olympiads, years } from '$lib/server/db/schema.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { requireAdmin } from '$lib/server/guard';

const CDN_BASE_URL = 'https://cdn.phoxiv.org';

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
	// Navigate to an existing olympiad+year, creating the year record if it doesn't exist yet.
	// If no year is provided, redirect to the olympiad metadata edit page instead.
	selectYear: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = locals.db;
		const data = await request.formData();
		const olympiadId = String(data.get('olympiadId') ?? '').trim();
		const yearRaw = String(data.get('year') ?? '').trim();

		if (!olympiadId) {
			return fail(400, { selectError: 'Please select an olympiad' });
		}

		// If year is empty, redirect to the olympiad metadata editor
		if (!yearRaw) {
			redirect(303, `/contribute/${olympiadId}`);
		}

		const year = parseInt(yearRaw, 10);
		if (isNaN(year) || year < 1900 || year > 2100) {
			return fail(400, { selectError: 'Please enter a valid year (1900–2100)' });
		}

		await db
			.insert(years)
			.values({ olympiadId, year, notes: '[]', extraLinks: '[]' })
			.onConflictDoNothing()
			.run();
		redirect(303, `/contribute/${olympiadId}/${year}`);
	},

	// Create a brand new olympiad, then go straight to editing its first year.
	// Optionally uploads an icon image to R2.
	createOlympiad: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const db = locals.db;
		const r2 = platform?.env.FILES;

		const data = await request.formData();
		const id = String(data.get('id') ?? '')
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-');
		const name = String(data.get('name') ?? '').trim();
		const summary = String(data.get('summary') ?? '').trim();
		const tag = String(data.get('tag') ?? '').trim();
		const year = parseInt(String(data.get('year') ?? ''), 10);
		const descriptionMd = String(data.get('description') ?? '').trim() || null;
		const iconFile = data.get('iconFile') as File | null;

		// Emoji icon field — used when no image file is uploaded
		const emojiIcon = String(data.get('icon') ?? '').trim();

		if (!id || !name || !summary || !tag || isNaN(year)) {
			return fail(400, { createError: 'All required fields must be filled in' });
		}
		const validTags = ['International', 'Regional', 'National', 'Open'];
		if (!validTags.includes(tag)) return fail(400, { createError: 'Invalid tag' });

		// Handle optional icon file upload
		let iconValue = emojiIcon;
		if (iconFile && iconFile.size > 0) {
			if (!r2) return fail(500, { createError: 'Storage unavailable for icon upload' });

			const MAX_BYTES = 2 * 1024 * 1024;
			if (iconFile.size > MAX_BYTES) {
				return fail(400, { createError: 'Icon file too large (max 2 MB)' });
			}

			const ALLOWED_EXTS = new Set(['svg', 'png', 'jpg', 'jpeg', 'webp', 'avif']);
			const ALLOWED_TYPES: Record<string, string> = {
				svg: 'image/svg+xml',
				png: 'image/png',
				jpg: 'image/jpeg',
				jpeg: 'image/jpeg',
				webp: 'image/webp',
				avif: 'image/avif'
			};
			const ext = iconFile.name.split('.').pop()?.toLowerCase() ?? '';
			if (!ALLOWED_EXTS.has(ext)) {
				return fail(400, { createError: 'Unsupported icon format. Use SVG, PNG, JPG, WebP, or AVIF.' });
			}
			const contentType = ALLOWED_TYPES[ext] ?? 'application/octet-stream';
			const key = `icons/olympiads/${id}.${ext}`;

			await r2.put(key, iconFile.stream(), { httpMetadata: { contentType } });
			iconValue = `${CDN_BASE_URL}/${key}`;
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

		try {
			await db
				.insert(olympiads)
				.values({
					id,
					name,
					summary,
					icon: iconValue,
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