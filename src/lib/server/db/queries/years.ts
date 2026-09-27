import { and, desc, eq } from 'drizzle-orm';
import { years, type DB } from '../index';

/** Reads and writes for the `years` table. */

export type YearRow = typeof years.$inferSelect;

export const YEAR_NOT_FOUND = 'Year not found';

/** A newly created year starts with empty JSON arrays, not SQL NULLs. */
const EMPTY_YEAR = { notes: '[]', extraLinks: '[]' } as const;

/** One year of one olympiad, or `undefined`. URLs use `(olympiadId, year)`, never `id`. */
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
 * Creates the year if missing. `created` decides whether an `add_year` log
 * entry is written.
 */
export async function ensureYear(
	db: DB,
	olympiadId: string,
	year: number
): Promise<{ created: boolean }> {
	// One atomic insert, not check-then-insert, so two racing requests can't
	// both report `created: true`.
	const inserted = await db
		.insert(years)
		.values({ olympiadId, year, ...EMPTY_YEAR })
		.onConflictDoNothing()
		.returning({ id: years.id })
		.all();

	return { created: inserted.length > 0 };
}

/** Creates a year that is known to be new and returns its id. */
export async function insertYear(db: DB, olympiadId: string, year: number): Promise<number> {
	const inserted = await db
		.insert(years)
		.values({ olympiadId, year, ...EMPTY_YEAR })
		.returning({ id: years.id })
		.get();
	return inserted.id;
}
