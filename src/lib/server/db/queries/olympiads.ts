import { asc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { olympiads, type DB } from '../index';
import type { OlympiadEntry, OlympiadTag } from '$lib/types';

/** Reads and DTO shaping for the `olympiads` table. */

export type OlympiadRow = typeof olympiads.$inferSelect;

export const OLYMPIAD_NOT_FOUND = 'Olympiad not found';

/**
 * The canonical display order: curated `displayOrder` first, id as a stable
 * tiebreaker so the list never shuffles between requests.
 */
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

/** Just id and name, in display order — for pickers and dropdowns. */
export async function listOlympiadOptions(db: DB): Promise<{ id: string; name: string }[]> {
	return db
		.select({ id: olympiads.id, name: olympiads.name })
		.from(olympiads)
		.orderBy(...displayOrder())
		.all();
}

/** One olympiad, or `undefined`. */
export async function getOlympiad(db: DB, id: string): Promise<OlympiadRow | undefined> {
	return db.select().from(olympiads).where(eq(olympiads.id, id)).get();
}

/**
 * One olympiad, throwing a 404 if it doesn't exist.
 *
 * For loads and endpoints. Form actions should use {@link getOlympiad} and
 * return `actionFail`, so the contributor keeps their unsaved input.
 */
export async function requireOlympiad(db: DB, id: string): Promise<OlympiadRow> {
	const row = await getOlympiad(db, id);
	if (!row) error(404, OLYMPIAD_NOT_FOUND);
	return row;
}

/**
 * The public DTO, as served by `/api/olympiads` and the olympiad page.
 *
 * Deliberately narrower than `OlympiadRow`: `descriptionMd` (the contributor's
 * unrendered draft) and `displayOrder` must never reach the publicly cached API.
 * `descriptionHtml` collapses to `undefined` rather than `null` so
 * `JSON.stringify` omits the key entirely, which is the existing wire format.
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
