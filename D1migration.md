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
## Olympiad detail loading

```ts
// src/routes/olympiads/[olympiad]/+page.server.ts
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
			.orderBy(problems.id)
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

## Global search

Two files need to be created or modified.

**Create** `src/routes/api/search/+server.ts`:

```ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { olympiads, years, problems, problemFiles } from '$lib/server/db/schema.js';
import type { SearchItem } from '$lib/pregen/types.js';

export const GET: RequestHandler = async ({ platform }) => {
	const d1 = platform?.env.DB;
	if (!d1) return json([], { status: 500 });

	const db = drizzle(d1);

	const rows = await db
		.select()
		.from(problems)
		.innerJoin(years, eq(years.id, problems.yearId))
		.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
		.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
		.all();

	const problemMap = new Map<number, SearchItem>();

	for (const row of rows) {
		const p = row.problems;
		const y = row.years;
		const o = row.olympiads;

		if (!problemMap.has(p.id)) {
			const probFTEntries = Object.entries(
				JSON.parse(o.problemFileTypes) as Record<string, { label: string }>
			);

			problemMap.set(p.id, {
				olympiadId: o.id,
				olympiadName: o.name,
				olympiadIcon: o.icon,
				year: y.year,
				searchText: [o.id, o.name, String(y.year), p.number, p.title ?? ''].join(' ').toLowerCase(),
				problem: {
					number: p.number,
					...(p.title ? { title: p.title } : {}),
					files: {}
				},
				probFTEntries
			});
		}

		if (row.problemFiles) {
			problemMap.get(p.id)!.problem.files[row.problemFiles.fileType] = row.problemFiles.url;
		}
	}

	return json([...problemMap.values()]);
};
```

**Update** the script block of `src/lib/components/GlobalSearch.svelte` — the template is unchanged:

```ts
import uFuzzy from '@leeoniya/ufuzzy';
import type { SearchItem } from '$lib/pregen/types.js';
import { Search } from '@lucide/svelte';
import XIcon from '@lucide/svelte/icons/x';
import { buttonVariants } from '$lib/components/ui/button/index.js';
import Badge from '$lib/components/ui/badge/badge.svelte';
import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
import { cn } from '$lib/utils.js';
import { goto } from '$app/navigation';
import { Dialog } from 'bits-ui';
import * as Kbd from '$lib/components/ui/kbd/index.js';

let { open = $bindable(false) }: { open?: boolean } = $props();

const uf = new uFuzzy({ intraMode: 1, intraIns: 1 });

// ---------------------------------------------------------------------------
// Index — fetched once on first open, then cached for the session
// ---------------------------------------------------------------------------

let index = $state<SearchItem[]>([]);
let indexLoading = $state(false);
let indexFetched = false;

async function fetchIndex() {
	if (indexFetched) return;
	indexLoading = true;
	try {
		const res = await fetch('/api/search');
		index = await res.json();
		indexFetched = true;
	} finally {
		indexLoading = false;
	}
}

$effect(() => {
	if (open) fetchIndex();
});

const haystack = $derived(index.map((i) => i.searchText));

const MAX_RESULTS = 50;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let query = $state('');
let focusedIndex = $state(0);
let inputEl: HTMLInputElement | undefined = $state();
let resultsEl: HTMLDivElement | undefined = $state();

const results = $derived.by(() => {
	const q = query.trim();
	if (!q || indexLoading) return [];
	const [idxs, , order] = uf.search(haystack, q.toLowerCase());
	if (!idxs?.length || !order?.length) return [];
	return order.slice(0, MAX_RESULTS).map((oi) => index[idxs[oi]]);
});

$effect(() => {
	query;
	focusedIndex = 0;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openSearch() {
	open = true;
	query = '';
	focusedIndex = 0;
}

function closeSearch() {
	open = false;
	query = '';
}

function navigateTo(item: SearchItem) {
	goto(`/olympiads/${item.olympiadId}#${item.year}`);
	closeSearch();
}

// ---------------------------------------------------------------------------
// Keyboard handling
// ---------------------------------------------------------------------------

function onWindowKeydown(e: KeyboardEvent) {
	if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
		e.preventDefault();
		open ? closeSearch() : openSearch();
		return;
	}
	if (!open) return;
	if (e.key === 'ArrowDown') {
		e.preventDefault();
		focusedIndex = Math.min(focusedIndex + 1, results.length - 1);
		resultsEl?.querySelectorAll('li')[focusedIndex].scrollIntoView({ block: 'nearest' });
	}
	if (e.key === 'ArrowUp') {
		e.preventDefault();
		focusedIndex = Math.max(focusedIndex - 1, 0);
		resultsEl?.querySelectorAll('li')[focusedIndex].scrollIntoView({ block: 'nearest' });
	}
	if (e.key === 'Enter' && results[focusedIndex]) {
		navigateTo(results[focusedIndex]);
	}
}
```

Then update the empty-state block in the template to handle the loading state:

```svelte
{#if indexLoading}
	<div class="m-auto">
		<p class="text-sm text-muted-foreground text-center">Loading search index…</p>
	</div>
{:else if !query.trim()}
	<div class="m-auto px-5">
		<p class="mb-5 text-sm text-muted-foreground text-center">
			Type to search for problems across all olympiads...
		</p>
		<p class="text-sm text-muted-foreground text-center">
			Use the order: olympiad name/acronym, year, problem title/number
		</p>
	</div>
{:else if results.length === 0}
	<!-- rest unchanged -->
```

The index is fetched once on the first open and then reused for the lifetime of the page — `indexFetched` acts as a module-level cache flag so navigating away and back doesn't trigger another fetch.

## Olympiad list and stats
Next up are the two remaining pages: the olympiads list and the home page stats.

**Create** `src/routes/olympiads/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import { olympiads } from '$lib/server/db/schema.js';
import type { OlympiadEntry } from '$lib/pregen/types.js';

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
```

**Update** the script block of `src/routes/olympiads/+page.svelte`:

```ts
import type { PageData } from './$types';
import type { OlympiadTag, OlympiadEntry } from '$lib/pregen/types.js';
import * as Card from '$lib/components/ui/card/index';
import { Badge } from '$lib/components/ui/badge/index';
import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
import SearchBar from '$lib/components/SearchBar.svelte';
import SearchEmptyState from '$lib/components/SearchEmptyState.svelte';
import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
import { ArrowRight } from '@lucide/svelte';
import { cn } from '$lib/utils.js';
import Title from '$lib/components/Title.svelte';

let { data }: { data: PageData } = $props();

const ALL_TAGS: OlympiadTag[] = ['International', 'Regional', 'National', 'Open'];

let query = $state('');
let activeTag = $state<OlympiadTag | null>(null);

const filtered = $derived(() => {
	const q = query.trim().toLowerCase();
	return (data.olympiads as OlympiadEntry[]).filter((c) => {
		const matchesTag = activeTag === null || c.tag === activeTag;
		const matchesQuery =
			!q ||
			c.name.toLowerCase().includes(q) ||
			c.summary.toLowerCase().includes(q) ||
			c.id.toLowerCase().includes(q);
		return matchesTag && matchesQuery;
	});
});
```

**Create** `src/routes/+page.server.ts`:

```ts
import type { PageServerLoad } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import { count } from 'drizzle-orm';
import { olympiads, years, problemFiles, yearFiles } from '$lib/server/db/schema.js';

export const load: PageServerLoad = async ({ platform }) => {
	const d1 = platform?.env.DB;
	if (!d1) return { stats: { olympiads: 0, years: 0, files: 0 } };

	const db = drizzle(d1);

	const [[olympiadCount], [yearCount], [yearFileCount], [problemFileCount]] = await Promise.all([
		db.select({ value: count() }).from(olympiads),
		db.select({ value: count() }).from(years),
		db.select({ value: count() }).from(yearFiles),
		db.select({ value: count() }).from(problemFiles)
	]);

	return {
		stats: {
			olympiads: olympiadCount.value,
			years: yearCount.value,
			files: yearFileCount.value + problemFileCount.value
		}
	};
};
```

**Update** the script block of `src/routes/+page.svelte`:

```ts
import type { PageData } from './$types';
import SvelteSeo from 'svelte-seo';
import { buttonVariants } from '$lib/components/ui/button/index.js';
import { cn } from '$lib/utils.js';
import logo from '$lib/assets/branding/logo.svg';

let { data }: { data: PageData } = $props();

let rotX = $state(12);
let rotY = $state(-18);

function handleMouseMove(e: MouseEvent) {
	const cx = window.innerWidth / 2;
	const cy = window.innerHeight / 2;
	rotY = ((e.clientX - cx) / cx) * 25;
	rotX = -((e.clientY - cy) / cy) * 18;
}

const statItems = [
	{ value: data.stats.olympiads, label: 'Olympiads' },
	{ value: data.stats.years, label: 'Years' },
	{ value: data.stats.files, label: 'Files' }
];
```

After these changes the pregeneration output files (`olympiads.json`, `files.json`, `stats.json`, `searchIndex.json`) are no longer imported anywhere in the application. You can delete `src/lib/pregen/output/` and the `pregen` script from `package.json` (since we should not be normally using it now), keeping only the migration scripts for future use.


