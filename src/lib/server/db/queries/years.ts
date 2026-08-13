import { and, desc, eq } from 'drizzle-orm';
import { years, type DB } from '../index';

/** Reads and writes for the `years` table. */

export type YearRow = typeof years.$inferSelect;

export const YEAR_NOT_FOUND = 'Year not found';

/** A newly created year starts with empty JSON arrays, not SQL NULLs. */
const EMPTY_YEAR = { notes: '[]', extraLinks: '[]' } as const;

/**
 * One year of one olympiad, or `undefined`.
 *
 * Years are identified by the `(olympiadId, year)` pair everywhere in the app —
 * the surrogate `id` never appears in a URL.
 */
export async function getYear(
	db: DB,
	olympiadId: string,
	year: number
): Promise<YearRow | undefined> {
	return db
		.select()
		.from(years)
		.where(and(eq(years.olympiadId, olympiadId), eq(years.year, year)))
		.get();
}

/** The olympiad's years, newest first. */
export async function listYearNumbers(db: DB, olympiadId: string): Promise<number[]> {
	const rows = await db
		.select({ year: years.year })
		.from(years)
		.where(eq(years.olympiadId, olympiadId))
		.orderBy(desc(years.year))
		.all();
	return rows.map((y) => y.year);
}

/**
 * Creates the year if it is missing, and reports whether it did.
 *
 * The `created` flag drives the `add_year` activity-log entry: re-submitting an
 * existing year should navigate to it, not log a second creation.
 */
export async function ensureYear(
	db: DB,
	olympiadId: string,
	year: number
): Promise<{ created: boolean }> {
	const existing = await db
		.select({ id: years.id })
		.from(years)
		.where(and(eq(years.olympiadId, olympiadId), eq(years.year, year)))
		.get();

	await db
		.insert(years)
		.values({ olympiadId, year, ...EMPTY_YEAR })
		.onConflictDoNothing()
		.run();

	return { created: !existing };
}

/** Creates a year unconditionally and returns its id. Used by the CSV import. */
export async function insertYear(db: DB, olympiadId: string, year: number): Promise<number> {
	const inserted = await db
		.insert(years)
		.values({ olympiadId, year, ...EMPTY_YEAR })
		.returning({ id: years.id })
		.get();
	return inserted.id;
}
