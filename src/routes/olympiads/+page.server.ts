import type { PageServerLoad } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import { olympiads } from '$lib/server/db/schema.js';
import type { OlympiadEntry } from '$lib/types.js';

export const load: PageServerLoad = async ({ platform }) => {
	const d1 = platform?.env.DB;
	if (!d1) return { olympiads: [] as OlympiadEntry[] };

	const db = drizzle(d1);

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
			tag: o.tag,
			descriptionHtml: o.descriptionHtml,
			yearFileTypes: JSON.parse(o.yearFileTypes) as OlympiadEntry['yearFileTypes'],
			problemFileTypes: JSON.parse(o.problemFileTypes) as OlympiadEntry['problemFileTypes']
		}))
	};
};
