import { asc } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { olympiads } from '$lib/server/db/schema.js';
import type { OlympiadEntry, OlympiadTag } from '$lib/types.js';

export const GET = async ({ locals, setHeaders}) => {
	setHeaders({
	// 	// max-age=0: prevents local cache from being used, so purge cache in cloudflare will update everyone's cache
	// 	// s-maxage=86400: shared cache only updates at most once a day
	// 	// stale-while-revalidate=604800: the shared cache will serve stale data after a day of "freshness", but force revalidation in the background. This ensures that no one will have to deal with a cache miss (unless no one views the site for a week)
		'cache-control': 'max-age=0, s-maxage=86400, stale-while-revalidate=604800'
	});

	const db = locals.db;

	const rows = await db
		.select()
		.from(olympiads)
		.orderBy(asc(olympiads.displayOrder), asc(olympiads.id))
		.all();

	return json(rows.map((o) => ({
			id: o.id,
			name: o.name,
			summary: o.summary,
			icon: o.icon,
			tag: o.tag as OlympiadTag,
			descriptionHtml: o.descriptionHtml ?? undefined
		})) satisfies OlympiadEntry[]);
};