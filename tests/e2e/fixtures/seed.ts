import { getTableColumns, type InferInsertModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as schema from '../../../src/lib/server/db/schema';
import { seedRows } from './seed-data';

/** D1 refuses a statement with more than 100 bound parameters. */
const MAX_BOUND_PARAMS = 100;

/**
 * Inserts `rows` in chunks that stay under D1's parameter limit. Drizzle binds a
 * parameter for every column of the table, not only the ones a row sets, so the
 * chunk size comes from the table's column count.
 */
async function insertChunked<T extends SQLiteTable>(
	db: ReturnType<typeof drizzle>,
	table: T,
	rows: InferInsertModel<T>[]
): Promise<void> {
	const perRow = Object.keys(getTableColumns(table)).length;
	const size = Math.max(1, Math.floor(MAX_BOUND_PARAMS / perRow));
	for (let i = 0; i < rows.length; i += size) {
		// The rows are checked against the table at the call site; TypeScript can't
		// relate `InferInsertModel<T>` to drizzle's insert type for a generic `T`.
		await db.insert(table).values(rows.slice(i, i + size) as never);
	}
}

/**
 * Fills an empty, freshly migrated database with `seed-data.ts`, parents before
 * children. `file_text` inserts fire the FTS5 triggers, so the index is built as
 * it would be in production.
 */
export async function seed(d1: D1Database, now = new Date()): Promise<void> {
	const db = drizzle(d1);
	const rows = seedRows(now);
	await insertChunked(db, schema.olympiads, rows.olympiads);
	await insertChunked(db, schema.years, rows.years);
	await insertChunked(db, schema.problems, rows.problems);
	await insertChunked(db, schema.yearFiles, rows.yearFiles);
	await insertChunked(db, schema.problemFiles, rows.problemFiles);
	await insertChunked(db, schema.fileText, rows.fileText);
	await insertChunked(db, schema.user, rows.user);
	await insertChunked(db, schema.session, rows.session);
	await insertChunked(db, schema.problemProgress, rows.problemProgress);
	await insertChunked(db, schema.activityLog, rows.activityLog);
}
