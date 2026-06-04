import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { olympiads } from '$lib/server/db/schema.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { requireAdmin } from '$lib/server/guard';

const CDN_BASE_URL = 'https://cdn.phoxiv.org';

export const load: PageServerLoad = async ({ params, locals }) => {
	const db = locals.db;

	const olympiadRow = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();

	if (!olympiadRow) error(404, 'Olympiad not found');

	return {
		olympiad: {
			id: olympiadRow.id,
			name: olympiadRow.name,
			summary: olympiadRow.summary,
			icon: olympiadRow.icon,
			tag: olympiadRow.tag,
			descriptionMd: olympiadRow.descriptionMd ?? '',
			displayOrder: olympiadRow.displayOrder
		}
	};
};

export const actions: Actions = {
	updateOlympiad: async ({ request, params, locals }) => {
		requireAdmin(locals);
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

		return { success: true, action: 'updateOlympiad' as const };
	},

	uploadIcon: async ({ request, params, platform, locals }) => {
		requireAdmin(locals);
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
			return fail(400, { uploadIconError: 'Unsupported file type. Use SVG, PNG, JPG, WebP, or AVIF.' });
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

		return { success: true, action: 'uploadIcon' as const, iconUrl };
	},

	removeIcon: async ({ params, locals }) => {
		requireAdmin(locals);
		const db = locals.db;

		// Clear to empty string so the fallback (emoji/flag) takes over
		await db
			.update(olympiads)
			.set({ icon: '' })
			.where(eq(olympiads.id, params.olympiad))
			.run();

		return { success: true, action: 'removeIcon' as const };
	}
};