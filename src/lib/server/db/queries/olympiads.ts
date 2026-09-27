import { asc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { olympiads, type DB } from '../index';
import type { OlympiadEntry, OlympiadOption, OlympiadTag } from '$lib/types';

/** Reads and DTO shaping for the `olympiads` table. */

export type OlympiadRow = typeof olympiads.$inferSelect;

export const OLYMPIAD_NOT_FOUND = 'Olympiad not found';

/** `displayOrder`, then id as a stable tiebreaker. */
function displayOrder() {
	return [asc(olympiads.displayOrder), asc(olympiads.id)] as const;
}

/** Every olympiad, in display order. */
export async function listOlympiads(db: DB): Promise<OlympiadRow[]> {
	return db
		.select()
		.from(olympiads)
		.orderBy(...displayOrder())
		.all();
}

/**
 * Id, name and icon in display order, for `OlympiadPicker` on `/contribute` and
 * `/admin`. Not cached, so its shape can change freely.
 */
export async function listOlympiadOptions(db: DB): Promise<OlympiadOption[]> {
	return db
		.select({ id: olympiads.id, name: olympiads.name, icon: olympiads.icon })
		.from(olympiads)
		.orderBy(...displayOrder())
		.all();
}

/** One olympiad, or `undefined`. */
export async function getOlympiad(db: DB, id: string): Promise<OlympiadRow | undefined> {
	return db.select().from(olympiads).where(eq(olympiads.id, id)).get();
}

/**
 * One olympiad, or a 404. For loads and endpoints only: actions should use
 * {@link getOlympiad} and `actionFail`, so typed input isn't lost.
 */
export async function requireOlympiad(db: DB, id: string): Promise<OlympiadRow> {
	const row = await getOlympiad(db, id);
	if (!row) error(404, OLYMPIAD_NOT_FOUND);
	return row;
}

/**
 * The public DTO for `/api/olympiads` and the olympiad page. `descriptionMd` and
 * `displayOrder` must not reach the public cache. A missing `descriptionHtml`
 * is `undefined` so the key is omitted from JSON.
 */
export function toOlympiadEntry(row: OlympiadRow): OlympiadEntry {
	return {
		id: row.id,
		name: row.name,
		summary: row.summary,
		icon: row.icon,
		tag: row.tag as OlympiadTag,
		descriptionHtml: row.descriptionHtml ?? undefined
	};
}
