import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { olympiads } from '$lib/server/db/schema.js';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { requireAdmin } from '$lib/server/guard';

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
			return fail(400, { error: 'Name, summary, and tag are required' });
		}

		const validTags = ['International', 'Regional', 'National', 'Open'];
		if (!validTags.includes(tag)) {
			return fail(400, { error: 'Invalid tag' });
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

		return { success: true };
	}
};