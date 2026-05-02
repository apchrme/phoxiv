import type { PageServerLoad } from './$types';
import { asc } from 'drizzle-orm';
import { olympiads } from '$lib/server/db/schema.js';
import type { OlympiadEntry, OlympiadTag } from '$lib/types.js';

export const load: PageServerLoad = async ({ locals }) => {
	const db = locals.db;

	const rows = await db
		.select()
		.from(olympiads)
		.orderBy(asc(olympiads.displayOrder), asc(olympiads.id))
		.all();

	return {
		olympiads: rows.map((o) => ({
			id: o.id,
			name: o.name,
			summary: o.summary,
			icon: o.icon,
			tag: o.tag as OlympiadTag,
			descriptionHtml: o.descriptionHtml ?? undefined
		})) satisfies OlympiadEntry[]
	};
};