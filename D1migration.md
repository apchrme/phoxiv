## Reset Cloudflare D1 binding

Configure `wrangler.jsonc` to point to the new binding

## Using Drizzle ORM
### Using drizzle-kit schema
```ts
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const olympiads = sqliteTable('olympiads', {
	id:                 text('id').primaryKey(),
	name:               text('name').notNull(),
	summary:            text('summary').notNull(),
	icon:               text('icon').notNull().default(''),
	tag:                text('tag', { enum: ['International', 'Regional', 'National', 'Open'] }).notNull(),
	displayOrder:       integer('display_order').notNull().default(9999),
	descriptionMd:      text('description_md'),
	descriptionHtml:    text('description_html'),
	yearFileTypes:      text('year_file_types').notNull().default('{}'),
	problemFileTypes:   text('problem_file_types').notNull().default('{}')
});

export const years = sqliteTable('years', {
	id:         integer('id').primaryKey({ autoIncrement: true }),
	olympiadId: text('olympiad_id').notNull().references(() => olympiads.id, { onDelete: 'cascade' }),
	year:       integer('year').notNull(),
	notes:      text('notes').notNull().default('[]'),
	extraLinks: text('extra_links').notNull().default('[]')
}, (t) => [
	uniqueIndex('years_olympiad_year_idx').on(t.olympiadId, t.year)
]);

export const yearFiles = sqliteTable('year_files', {
	id:       integer('id').primaryKey({ autoIncrement: true }),
	yearId:   integer('year_id').notNull().references(() => years.id, { onDelete: 'cascade' }),
	fileType: text('file_type').notNull(),
	url:      text('url').notNull()
}, (t) => [
	uniqueIndex('year_files_year_type_idx').on(t.yearId, t.fileType)
]);

export const problems = sqliteTable('problems', {
	id:     integer('id').primaryKey({ autoIncrement: true }),
	yearId: integer('year_id').notNull().references(() => years.id, { onDelete: 'cascade' }),
	number: text('number').notNull(),
	title:  text('title')
}, (t) => [
	uniqueIndex('problems_year_number_idx').on(t.yearId, t.number)
]);

export const problemFiles = sqliteTable('problem_files', {
	id:        integer('id').primaryKey({ autoIncrement: true }),
	problemId: integer('problem_id').notNull().references(() => problems.id, { onDelete: 'cascade' }),
	fileType:  text('file_type').notNull(),
	url:       text('url').notNull()
}, (t) => [
	uniqueIndex('problem_files_problem_type_idx').on(t.problemId, t.fileType)
]);
```

After running `drizzle-kit generate`, verify that the generated SQL matches the schema we designed — particularly that the `ON DELETE CASCADE` clauses and unique indexes are present, as these are easy to silently lose in ORM-generated migrations. Then apply it:

### Applying SQL migrations and seeding
Add a `--remote` flag to the wrangler commands to apply to remote.

```sh
# Generate the schema migration
bunx wrangler d1 migrations apply DB

# Generate and apply the seed data
bun run migrate:d1
bunx wrangler d1 execute DB --file=seed.sql
```
## +page.server.ts
The root fix is replacing the IN clauses with joins filtered by `olympiad_id`, so the number of SQL variables stays constant regardless of how many problems exist. Using Drizzle's join API makes this natural.

```ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { YearEntry } from '$lib/pregen/types.js';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc } from 'drizzle-orm';
import { olympiads, years, yearFiles, problems, problemFiles } from '$lib/server/db/schema.js';

export const load: PageServerLoad = async ({ params, platform }) => {
	const d1 = platform?.env.DB;
	if (!d1) error(500, { message: 'Database unavailable' });

	const db = drizzle(d1);

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
		descriptionHtml: olympiadRow.descriptionHtml,
		yearFileTypes: JSON.parse(olympiadRow.yearFileTypes) as Record<string, { label: string }>,
		problemFileTypes: JSON.parse(olympiadRow.problemFileTypes) as Record<string, { label: string }>
	};

	// Two queries with joins instead of IN clauses — variable count is always 1 (the olympiad id)
	const [yearRows, problemRows] = await Promise.all([
		db
			.select()
			.from(years)
			.leftJoin(yearFiles, eq(yearFiles.yearId, years.id))
			.where(eq(years.olympiadId, params.olympiad))
			.orderBy(desc(years.year))
			.all(),
		db
			.select()
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			.innerJoin(years, eq(years.id, problems.yearId))
			.where(eq(years.olympiadId, params.olympiad))
			.all()
	]);

	// Merge year file rows into a map keyed by year id
	const yearMap = new Map<number, {
		year: number;
		notes: string;
		extraLinks: string;
		yearFiles: Record<string, string>;
	}>();

	for (const row of yearRows) {
		const y = row.years;
		if (!yearMap.has(y.id)) {
			yearMap.set(y.id, {
				year: y.year,
				notes: y.notes,
				extraLinks: y.extraLinks,
				yearFiles: {}
			});
		}
		if (row.yearFiles) {
			yearMap.get(y.id)!.yearFiles[row.yearFiles.fileType] = row.yearFiles.url;
		}
	}

	// Merge problem file rows into a map keyed by problem id
	const problemMap = new Map<number, {
		yearId: number;
		number: string;
		title: string | null;
		files: Record<string, string>;
	}>();

	for (const row of problemRows) {
		const p = row.problems;
		if (!problemMap.has(p.id)) {
			problemMap.set(p.id, {
				yearId: p.yearId,
				number: p.number,
				title: p.title,
				files: {}
			});
		}
		if (row.problemFiles) {
			problemMap.get(p.id)!.files[row.problemFiles.fileType] = row.problemFiles.url;
		}
	}

	// Group problems by year id
	const problemsByYear = new Map<number, YearEntry['problems']>();
	for (const p of problemMap.values()) {
		const list = problemsByYear.get(p.yearId) ?? [];
		list.push({
			number: p.number,
			...(p.title ? { title: p.title } : {}),
			files: p.files
		});
		problemsByYear.set(p.yearId, list);
	}

	// Build the final array, deduplicating years that appear multiple times
	// due to the leftJoin expanding one year into multiple rows
	const seen = new Set<number>();
	const olympiadFiles: YearEntry[] = [];

	for (const row of yearRows) {
		const y = row.years;
		if (seen.has(y.id)) continue;
		seen.add(y.id);

		const entry = yearMap.get(y.id)!;
		olympiadFiles.push({
			year: entry.year,
			notes: JSON.parse(entry.notes) as string[],
			extraLinks: JSON.parse(entry.extraLinks) as YearEntry['extraLinks'],
			yearFiles: entry.yearFiles,
			problems: problemsByYear.get(y.id) ?? []
		});
	}

	return { olympiad, olympiadFiles };
};
```

The key change is that both queries filter with a single `WHERE years.olympiad_id = ?` rather than `WHERE id IN (?, ?, ?, ...)`, so the number of bound parameters never grows with the size of the dataset. The two queries also run in parallel via `Promise.all`, so the round-trip count stays the same as before.
