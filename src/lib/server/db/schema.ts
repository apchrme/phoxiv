import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const olympiads = sqliteTable('olympiads', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	summary: text('summary').notNull(),
	icon: text('icon').notNull().default(''),
	tag: text('tag', { enum: ['International', 'Regional', 'National', 'Open'] }).notNull(),
	displayOrder: integer('display_order').notNull().default(9999),
	descriptionMd: text('description_md'),
	descriptionHtml: text('description_html')
});

export const years = sqliteTable(
	'years',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		olympiadId: text('olympiad_id')
			.notNull()
			.references(() => olympiads.id, { onDelete: 'cascade' }),
		year: integer('year').notNull(),
		notes: text('notes').notNull().default('[]'),
		extraLinks: text('extra_links').notNull().default('[]')
	},
	(t) => [uniqueIndex('years_olympiad_year_idx').on(t.olympiadId, t.year)]
);

export const yearFiles = sqliteTable(
	'year_files',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		yearId: integer('year_id')
			.notNull()
			.references(() => years.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		url: text('url').notNull()
	},
	(t) => [uniqueIndex('year_files_year_label_idx').on(t.yearId, t.label)]
);

export const problems = sqliteTable(
	'problems',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		yearId: integer('year_id')
			.notNull()
			.references(() => years.id, { onDelete: 'cascade' }),
		number: text('number').notNull(),
		title: text('title')
	},
	(t) => [uniqueIndex('problems_year_number_idx').on(t.yearId, t.number)]
);

export const problemFiles = sqliteTable(
	'problem_files',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		problemId: integer('problem_id')
			.notNull()
			.references(() => problems.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		url: text('url').notNull()
	},
	(t) => [uniqueIndex('problem_files_problem_label_idx').on(t.problemId, t.label)]
);