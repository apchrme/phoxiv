import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { olympiads } from '$lib/server/db/schema.js';

export const load = async ({ params, locals }) => {
	const db = locals.db;

	const olympiadRow = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();

	if (!olympiadRow) error(404, { message: 'Not found' });

	const olympiad = {
		id: olympiadRow.id,
		name: olympiadRow.name,
		summary: olympiadRow.summary,
		icon: olympiadRow.icon,
		tag: olympiadRow.tag,
		descriptionHtml: olympiadRow.descriptionHtml
	};

	return { olympiad };
};
