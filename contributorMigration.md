This is a significant amount of code across several files, so let me lay out the full structure before writing each one.

**Files involved:**
1. `wrangler.jsonc` — add R2 binding
2. `src/app.d.ts` — type the FILES binding
3. `src/routes/contribute/+page.server.ts` — select/create olympiad and year
4. `src/routes/contribute/+page.svelte` — landing page
5. `src/routes/contribute/[olympiad]/[year]/+page.server.ts` — metadata + file upload actions
6. `src/routes/contribute/[olympiad]/[year]/+page.svelte` — year editor

---

**`wrangler.jsonc`** — add inside the top-level object:

```jsonc
"r2_buckets": [
    {
        "binding": "FILES",
        "bucket_name": "phoxiv-files"
    }
]
```

---

**`src/app.d.ts`**:

```ts
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';

declare global {
	namespace App {
		interface Locals {
			db: DrizzleD1Database;
		}
		interface Platform {
			env: Env & {
				FILES: R2Bucket;
			};
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

export {};
```

---

**`src/routes/contribute/+page.server.ts`**:

```ts
import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import { asc } from 'drizzle-orm';
import { olympiads, years } from '$lib/server/db/schema.js';
import { marked } from 'marked';

export const load: PageServerLoad = async ({ platform }) => {
	const d1 = platform?.env.DB;
	if (!d1) return { olympiads: [] };
	const db = drizzle(d1);
	const rows = await db
		.select({ id: olympiads.id, name: olympiads.name })
		.from(olympiads)
		.orderBy(asc(olympiads.displayOrder), asc(olympiads.id))
		.all();
	return { olympiads: rows };
};

export const actions: Actions = {
	// Navigate to an existing olympiad+year, creating the year record if it doesn't exist yet
	selectYear: async ({ request, platform }) => {
		const d1 = platform?.env.DB;
		if (!d1) return fail(500, { error: 'Database unavailable' });
		const db = drizzle(d1);
		const data = await request.formData();
		const olympiadId = String(data.get('olympiadId') ?? '').trim();
		const year = parseInt(String(data.get('year') ?? ''), 10);
		if (!olympiadId || isNaN(year) || year < 1900 || year > 2100) {
			return fail(400, { selectError: 'Valid olympiad and year are required' });
		}
		await db
			.insert(years)
			.values({ olympiadId, year, notes: '[]', extraLinks: '[]' })
			.onConflictDoNothing()
			.run();
		redirect(303, `/contribute/${olympiadId}/${year}`);
	},

	// Create a brand new olympiad, then go straight to editing its first year
	createOlympiad: async ({ request, platform }) => {
		const d1 = platform?.env.DB;
		if (!d1) return fail(500, { error: 'Database unavailable' });
		const db = drizzle(d1);
		const data = await request.formData();
		const id = String(data.get('id') ?? '').trim().toLowerCase().replace(/\s+/g, '-');
		const name = String(data.get('name') ?? '').trim();
		const summary = String(data.get('summary') ?? '').trim();
		const icon = String(data.get('icon') ?? '').trim();
		const tag = String(data.get('tag') ?? '').trim();
		const year = parseInt(String(data.get('year') ?? ''), 10);
		const descriptionMd = String(data.get('description') ?? '').trim() || null;
		if (!id || !name || !summary || !tag || isNaN(year)) {
			return fail(400, { createError: 'All required fields must be filled in' });
		}
		const validTags = ['International', 'Regional', 'National', 'Open'];
		if (!validTags.includes(tag)) return fail(400, { createError: 'Invalid tag' });
		const descriptionHtml = descriptionMd ? (marked.parse(descriptionMd) as string) : null;
		// Minimal default file types — can be expanded later via a future settings page
		const defaultYearFileTypes = JSON.stringify({
			problems: { label: 'Problems' },
			solutions: { label: 'Solutions' },
			answerSheet: { label: 'Answer Sheets' },
			results: { label: 'Results' }
		});
		const defaultProblemFileTypes = JSON.stringify({
			problem: { label: 'Problem' },
			solution: { label: 'Solution' },
			markingScheme: { label: 'Marking Scheme' }
		});
		try {
			await db
				.insert(olympiads)
				.values({
					id,
					name,
					summary,
					icon,
					tag: tag as 'International' | 'Regional' | 'National' | 'Open',
					descriptionMd,
					descriptionHtml,
					yearFileTypes: defaultYearFileTypes,
					problemFileTypes: defaultProblemFileTypes
				})
				.run();
		} catch {
			return fail(400, { createError: `An olympiad with the ID "${id}" already exists` });
		}
		await db
			.insert(years)
			.values({ olympiadId: id, year, notes: '[]', extraLinks: '[]' })
			.run();
		redirect(303, `/contribute/${id}/${year}`);
	}
};
```

---

**`src/routes/contribute/+page.svelte`**:

```svelte
<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import Title from '$lib/components/Title.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { cn } from '$lib/utils.js';

	let { data, form }: PageProps = $props();

	let mode = $state<'existing' | 'new'>('existing');
</script>

<Title title="Contribute" description="Add or edit olympiad content." />

<div class="mx-auto max-w-xl space-y-6">
	<ToggleGroup.Root
		type="single"
		value={mode}
		onValueChange={(v) => { if (v) mode = v as 'existing' | 'new'; }}
	>
		<ToggleGroup.Item value="existing">Existing olympiad</ToggleGroup.Item>
		<ToggleGroup.Item value="new">New olympiad</ToggleGroup.Item>
	</ToggleGroup.Root>

	{#if mode === 'existing'}
		<Card.Root>
			<Card.Header>
				<Card.Title>Go to a year</Card.Title>
				<Card.Description>
					Select an olympiad and enter a year. The year will be created if it doesn't exist yet.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/selectYear" use:enhance class="flex flex-col gap-4">
					<div class="flex flex-col gap-1.5">
						<label for="olympiadId" class="text-sm font-medium">Olympiad</label>
						<select
							id="olympiadId"
							name="olympiadId"
							required
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							{#each data.olympiads as o (o.id)}
								<option value={o.id}>{o.name}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="year" class="text-sm font-medium">Year</label>
						<input
							id="year"
							name="year"
							type="number"
							required
							min="1900"
							max="2100"
							placeholder="e.g. 2025"
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
					</div>
					{#if form?.selectError}
						<p class="text-sm text-destructive">{form.selectError}</p>
					{/if}
					<Button type="submit" class="self-start">Go →</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>New olympiad</Card.Title>
				<Card.Description>
					Creates a new olympiad and takes you straight to editing its first year.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/createOlympiad" use:enhance class="flex flex-col gap-4">
					<div class="grid grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label for="id" class="text-sm font-medium">ID <span class="text-muted-foreground">(slug)</span></label>
							<input
								id="id"
								name="id"
								type="text"
								required
								placeholder="e.g. ipho"
								class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="icon" class="text-sm font-medium">Icon <span class="text-muted-foreground">(emoji)</span></label>
							<input
								id="icon"
								name="icon"
								type="text"
								placeholder="e.g. 🌍"
								class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						</div>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="name" class="text-sm font-medium">Full name</label>
						<input
							id="name"
							name="name"
							type="text"
							required
							placeholder="e.g. International Physics Olympiad"
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="summary" class="text-sm font-medium">Summary</label>
						<input
							id="summary"
							name="summary"
							type="text"
							required
							placeholder="One sentence description"
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label for="tag" class="text-sm font-medium">Tag</label>
							<select
								id="tag"
								name="tag"
								required
								class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<option value="International">International</option>
								<option value="Regional">Regional</option>
								<option value="National">National</option>
								<option value="Open">Open</option>
							</select>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="year" class="text-sm font-medium">First year</label>
							<input
								id="year"
								name="year"
								type="number"
								required
								min="1900"
								max="2100"
								placeholder="e.g. 2025"
								class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						</div>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="description" class="text-sm font-medium">
							Description <span class="text-muted-foreground">(optional, Markdown)</span>
						</label>
						<textarea
							id="description"
							name="description"
							rows="3"
							placeholder="Longer description shown on the olympiad page..."
							class="w-full rounded-xl border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						></textarea>
					</div>
					{#if form?.createError}
						<p class="text-sm text-destructive">{form.createError}</p>
					{/if}
					<Button type="submit" class="self-start">Create olympiad →</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
```

---

**`src/routes/contribute/[olympiad]/[year]/+page.server.ts`**:

```ts
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { olympiads, years, yearFiles, problems, problemFiles } from '$lib/server/db/schema.js';

const CDN_BASE_URL = 'https://cdn.phoxiv.org';

export const load: PageServerLoad = async ({ params, platform }) => {
	const d1 = platform?.env.DB;
	if (!d1) error(500, 'Database unavailable');
	const db = drizzle(d1);

	const yearNum = parseInt(params.year, 10);
	if (isNaN(yearNum)) error(400, 'Invalid year');

	const olympiad = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();
	if (!olympiad) error(404, 'Olympiad not found');

	const yearRow = await db
		.select()
		.from(years)
		.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
		.get();
	if (!yearRow) error(404, 'Year not found');

	const [yearFileRows, problemRows] = await Promise.all([
		db.select().from(yearFiles).where(eq(yearFiles.yearId, yearRow.id)).all(),
		db
			.select()
			.from(problems)
			.leftJoin(problemFiles, eq(problemFiles.problemId, problems.id))
			.where(eq(problems.yearId, yearRow.id))
			.orderBy(problems.id)
			.all()
	]);

	const problemMap = new Map
		number,
		{ id: number; number: string; title: string | null; files: Record<string, string> }
	>();
	for (const row of problemRows) {
		const p = row.problems;
		if (!problemMap.has(p.id)) {
			problemMap.set(p.id, { id: p.id, number: p.number, title: p.title, files: {} });
		}
		if (row.problemFiles) {
			problemMap.get(p.id)!.files[row.problemFiles.fileType] = row.problemFiles.url;
		}
	}

	return {
		olympiad: {
			id: olympiad.id,
			name: olympiad.name,
			yearFileTypes: JSON.parse(olympiad.yearFileTypes) as Record<string, { label: string }>,
			problemFileTypes: JSON.parse(olympiad.problemFileTypes) as Record<string, { label: string }>
		},
		year: {
			id: yearRow.id,
			year: yearRow.year,
			notes: JSON.parse(yearRow.notes) as string[],
			extraLinks: JSON.parse(yearRow.extraLinks) as { label: string; url: string }[]
		},
		yearFiles: Object.fromEntries(yearFileRows.map((f) => [f.fileType, f.url])) as Record
			string,
			string
		>,
		problems: [...problemMap.values()]
	};
};

export const actions: Actions = {
	// Phase 1 — save year metadata (notes, extra links) and problem list (number + title)
	saveMetadata: async ({ request, params, platform }) => {
		const d1 = platform?.env.DB;
		if (!d1) return fail(500, { error: 'Database unavailable' });
		const db = drizzle(d1);
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		const notes = data
			.getAll('note')
			.map((n) => String(n).trim())
			.filter(Boolean);
		const linkLabels = data.getAll('linkLabel').map(String);
		const linkUrls = data.getAll('linkUrl').map(String);
		const extraLinks = linkLabels
			.map((label, i) => ({ label: label.trim(), url: (linkUrls[i] ?? '').trim() }))
			.filter((l) => l.label && l.url);

		await db
			.update(years)
			.set({ notes: JSON.stringify(notes), extraLinks: JSON.stringify(extraLinks) })
			.where(eq(years.id, yearRow.id))
			.run();

		const problemNumbers = data
			.getAll('problemNumber')
			.map((n) => String(n).trim())
			.filter(Boolean);
		const problemTitles = data.getAll('problemTitle').map(String);

		for (let i = 0; i < problemNumbers.length; i++) {
			const number = problemNumbers[i];
			const title = (problemTitles[i] ?? '').trim() || null;
			await db
				.insert(problems)
				.values({ yearId: yearRow.id, number, title })
				.onConflictDoUpdate({
					target: [problems.yearId, problems.number],
					set: { title }
				})
				.run();
		}

		// Remove problems not in the submitted list.
		// ON DELETE CASCADE removes their problem_files rows from D1.
		// Note: the corresponding R2 objects become orphaned and should be cleaned up manually.
		const existing = await db
			.select({ id: problems.id, number: problems.number })
			.from(problems)
			.where(eq(problems.yearId, yearRow.id))
			.all();
		for (const p of existing) {
			if (!problemNumbers.includes(p.number)) {
				await db.delete(problems).where(eq(problems.id, p.id)).run();
			}
		}

		return { success: true, action: 'saveMetadata' as const };
	},

	// Phase 2 — upload a file to R2 and record its URL in D1
	uploadFile: async ({ request, params, platform }) => {
		const d1 = platform?.env.DB;
		const r2 = platform?.env.FILES;
		if (!d1 || !r2) return fail(500, { error: 'Storage unavailable' });
		const db = drizzle(d1);
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const fileType = String(data.get('fileType') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim(); // 'year' | 'problem'
		const problemNumber = String(data.get('problemNumber') ?? '').trim();
		const file = data.get('file') as File | null;

		if (!file || file.size === 0) return fail(400, { error: 'No file provided' });
		if (!fileType || !scope) return fail(400, { error: 'Missing required fields' });
		if (scope === 'problem' && !problemNumber) return fail(400, { error: 'Problem number required' });

		const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
		const key =
			scope === 'year'
				? `olympiads/${params.olympiad}/${params.year}/${fileType}.${ext}`
				: `olympiads/${params.olympiad}/${params.year}/${problemNumber}_${fileType}.${ext}`;

		await r2.put(key, file.stream(), {
			httpMetadata: { contentType: file.type || 'application/pdf' }
		});

		const url = `${CDN_BASE_URL}/${key}`;

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		if (scope === 'year') {
			await db
				.insert(yearFiles)
				.values({ yearId: yearRow.id, fileType, url })
				.onConflictDoUpdate({
					target: [yearFiles.yearId, yearFiles.fileType],
					set: { url }
				})
				.run();
		} else {
			const problem = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (!problem)
				return fail(404, {
					error: `Problem ${problemNumber} not found — save metadata first`
				});
			await db
				.insert(problemFiles)
				.values({ problemId: problem.id, fileType, url })
				.onConflictDoUpdate({
					target: [problemFiles.problemId, problemFiles.fileType],
					set: { url }
				})
				.run();
		}

		return { success: true, action: 'uploadFile' as const };
	},

	// Phase 2 — delete a file from both R2 and D1
	deleteFile: async ({ request, params, platform }) => {
		const d1 = platform?.env.DB;
		const r2 = platform?.env.FILES;
		if (!d1 || !r2) return fail(500, { error: 'Storage unavailable' });
		const db = drizzle(d1);
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const fileType = String(data.get('fileType') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim();
		const problemNumber = String(data.get('problemNumber') ?? '').trim();
		const url = String(data.get('url') ?? '').trim();

		// Derive the R2 key from the stored CDN URL
		if (url.startsWith(CDN_BASE_URL + '/')) {
			await r2.delete(url.slice(CDN_BASE_URL.length + 1));
		}

		const yearRow = await db
			.select()
			.from(years)
			.where(and(eq(years.olympiadId, params.olympiad), eq(years.year, yearNum)))
			.get();
		if (!yearRow) return fail(404, { error: 'Year not found' });

		if (scope === 'year') {
			await db
				.delete(yearFiles)
				.where(and(eq(yearFiles.yearId, yearRow.id), eq(yearFiles.fileType, fileType)))
				.run();
		} else {
			const problem = await db
				.select()
				.from(problems)
				.where(and(eq(problems.yearId, yearRow.id), eq(problems.number, problemNumber)))
				.get();
			if (problem) {
				await db
					.delete(problemFiles)
					.where(
						and(eq(problemFiles.problemId, problem.id), eq(problemFiles.fileType, fileType))
					)
					.run();
			}
		}

		return { success: true, action: 'deleteFile' as const };
	}
};
```

---

**`src/routes/contribute/[olympiad]/[year]/+page.svelte`**:

```svelte
<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { ChevronLeft, Plus, Trash2, ExternalLink 