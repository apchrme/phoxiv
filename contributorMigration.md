This is a significant amount of code across several files, so let me lay out the full structure before writing each one.

**Files involved:**
1. `src/routes/contribute/+page.server.ts` — select/create olympiad and year
2. `src/routes/contribute/+page.svelte` — landing page
3. `src/routes/contribute/[olympiad]/[year]/+page.server.ts` — metadata + file upload actions
4. `src/routes/contribute/[olympiad]/[year]/+page.svelte` — year editor


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
import { eq, and } from 'drizzle-orm';
import { olympiads, years, yearFiles, problems, problemFiles } from '$lib/server/db/schema.js';

const CDN_BASE_URL = 'https://cdn.phoxiv.org';

export const load: PageServerLoad = async ({ params, locals }) => {
	const db = locals.db;
	const yearNum = parseInt(params.year, 10);
	if (isNaN(yearNum)) error(400, 'Invalid year');

	const olympiadRow = await db
		.select()
		.from(olympiads)
		.where(eq(olympiads.id, params.olympiad))
		.get();
	if (!olympiadRow) error(404, 'Olympiad not found');

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
		// Bug 1 fix: Drizzle uses SQL table name 'problem_files', not JS variable name 'problemFiles'
		if (row.problem_files) {
			problemMap.get(p.id)!.files[row.problem_files.fileType] = row.problem_files.url;
		}
	}

	return {
		olympiad: {
			id: olympiadRow.id,
			name: olympiadRow.name,
			yearFileTypes: JSON.parse(olympiadRow.yearFileTypes) as Record<string, { label: string }>,
			problemFileTypes: JSON.parse(olympiadRow.problemFileTypes) as Record<string, { label: string }>
		},
		year: {
			id: yearRow.id,
			year: yearRow.year,
			notes: JSON.parse(yearRow.notes) as string[],
			extraLinks: JSON.parse(yearRow.extraLinks) as { label: string; url: string }[]
		},
		yearFiles: Object.fromEntries(yearFileRows.map((f) => [f.fileType, f.url])) as Record<string, string>,
		problems: [...problemMap.values()]
	};
};

export const actions: Actions = {
	saveMetadata: async ({ request, params, locals }) => {
		const db = locals.db;
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

		// Bug fix: parse as pairs to avoid index misalignment when numbers are blank
		const rawNumbers = data.getAll('problemNumber').map((n) => String(n).trim());
		const rawTitles = data.getAll('problemTitle').map(String);
		const problemPairs = rawNumbers
			.map((number, i) => ({ number, title: (rawTitles[i] ?? '').trim() || null }))
			.filter((p) => p.number);

		for (const { number, title } of problemPairs) {
			await db
				.insert(problems)
				.values({ yearId: yearRow.id, number, title })
				.onConflictDoUpdate({
					target: [problems.yearId, problems.number],
					set: { title }
				})
				.run();
		}

		// Remove problems not in the submitted list — ON DELETE CASCADE cleans up problem_files
		const submittedNumbers = problemPairs.map((p) => p.number);
		const existing = await db
			.select({ id: problems.id, number: problems.number })
			.from(problems)
			.where(eq(problems.yearId, yearRow.id))
			.all();
		for (const p of existing) {
			if (!submittedNumbers.includes(p.number)) {
				await db.delete(problems).where(eq(problems.id, p.id)).run();
			}
		}

		return { success: true, action: 'saveMetadata' as const };
	},

	uploadFile: async ({ request, params, platform, locals }) => {
		const db = locals.db;
		// Bug 2 fix: binding is 'files' (lowercase), not 'FILES'
		const r2 = platform?.env.files;
		if (!r2) return fail(500, { error: 'Storage unavailable' });
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const fileType = String(data.get('fileType') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim();
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
				return fail(404, { error: `Problem ${problemNumber} not found — save metadata first` });
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

	deleteFile: async ({ request, params, platform, locals }) => {
		const db = locals.db;
		// Bug 2 fix: binding is 'files' (lowercase), not 'FILES'
		const r2 = platform?.env.files;
		if (!r2) return fail(500, { error: 'Storage unavailable' });
		const yearNum = parseInt(params.year, 10);
		const data = await request.formData();

		const fileType = String(data.get('fileType') ?? '').trim();
		const scope = String(data.get('scope') ?? '').trim();
		const problemNumber = String(data.get('problemNumber') ?? '').trim();
		const url = String(data.get('url') ?? '').trim();

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
    import { ChevronLeft, Plus, Trash2, ExternalLink } from '@lucide/svelte';
    import { Button } from '$lib/components/ui/button/index.js';
    import * as Card from '$lib/components/ui/card/index.js';
    import { Badge } from '$lib/components/ui/badge/index.js';
    import { Separator } from '$lib/components/ui/separator/index.js';
    import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
    import { toast } from 'svelte-sonner';

    let { data, form }: PageProps = $props();

    let phase = $state<'metadata' | 'files'>('metadata');

    let notes = $state<string[]>([...data.year.notes]);
    let extraLinks = $state<{ label: string; url: string }[]>([...data.year.extraLinks]);
    let problemList = $state<{ number: string; title: string }[]>(
        data.problems.map((p) => ({ number: p.number, title: p.title ?? '' }))
    );

    let uploading = $state<Record<string, boolean>>({});

    // Bug fix: use 'in' narrowing so TypeScript knows which variant of form we have
    $effect(() => {
        if (!form) return;
        if ('success' in form && form.success) {
            if (form.action === 'saveMetadata') toast.success('Metadata saved');
            if (form.action === 'uploadFile') toast.success('File uploaded');
            if (form.action === 'deleteFile') toast.success('File deleted');
        }
        if ('error' in form && form.error) {
            toast.error(String(form.error));
        }
    });

    function addNote() { notes.push(''); }
    function removeNote(i: number) { notes.splice(i, 1); }
    function addLink() { extraLinks.push({ label: '', url: '' }); }
    function removeLink(i: number) { extraLinks.splice(i, 1); }
    function addProblem() { problemList.push({ number: '', title: '' }); }
    function removeProblem(i: number) { problemList.splice(i, 1); }

    const yearFTEntries = $derived(Object.entries(data.olympiad.yearFileTypes));
    const probFTEntries = $derived(Object.entries(data.olympiad.problemFileTypes));

    function uploadKey(scope: 'year' | 'problem', fileType: string, problemNumber?: string) {
        return scope === 'year' ? `year__${fileType}` : `${problemNumber}__${fileType}`;
    }

</script>

<a
	href="/contribute"
	class="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-primary"
>
	<ChevronLeft class="size-4" />
	Back
</a>

<header class="flex flex-col gap-1 py-5">
	<h1 class="text-2xl font-bold tracking-tight">
		{data.olympiad.name}
		<span class="font-mono text-primary">{data.year.year}</span>
	</h1>
	<p class="text-sm text-muted-foreground">
		Editing <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{data.olympiad.id}/{data.year.year}</code>
	</p>
</header>

<ToggleGroup.Root
	type="single"
	value={phase}
	onValueChange={(v) => { if (v) phase = v as 'metadata' | 'files'; }}
	class="mb-6"
>
	<ToggleGroup.Item value="metadata">Phase 1 — Metadata</ToggleGroup.Item>
	<ToggleGroup.Item value="files">Phase 2 — Files</ToggleGroup.Item>
</ToggleGroup.Root>

<!-- ══════════════════════════════════════════════════════════════════════
     PHASE 1 — Metadata & problem list
     ══════════════════════════════════════════════════════════════════════ -->

{#if phase === 'metadata'}
	<form method="POST" action="?/saveMetadata" use:enhance class="flex flex-col gap-6">

		<!-- Notes -->
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Notes</Card.Title>
				<Card.Description>Short notices shown above the file links for this year.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3 pt-5">
				{#each notes as _, i}
					<div class="flex gap-2">
						<input
							name="note"
							type="text"
							bind:value={notes[i]}
							placeholder="e.g. Solutions are unofficial"
							class="h-9 flex-1 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onclick={() => removeNote(i)}
						>
							<Trash2 class="size-4" />
						</Button>
					</div>
				{/each}
				<Button type="button" variant="outline" size="sm" onclick={addNote} class="self-start">
					<Plus class="size-4" /> Add note
				</Button>
			</Card.Content>
		</Card.Root>

		<!-- Extra links -->
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Extra links</Card.Title>
				<Card.Description>External links not associated with uploaded files.</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3 pt-5">
				{#each extraLinks as _, i}
					<div class="flex gap-2">
						<input
							name="linkLabel"
							type="text"
							bind:value={extraLinks[i].label}
							placeholder="Label"
							class="h-9 w-32 shrink-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
						<input
							name="linkUrl"
							type="url"
							bind:value={extraLinks[i].url}
							placeholder="https://..."
							class="h-9 flex-1 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onclick={() => removeLink(i)}
						>
							<Trash2 class="size-4" />
						</Button>
					</div>
				{/each}
				<Button type="button" variant="outline" size="sm" onclick={addLink} class="self-start">
					<Plus class="size-4" /> Add link
				</Button>
			</Card.Content>
		</Card.Root>

		<!-- Problems -->
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Problems</Card.Title>
				<Card.Description>
					Define the problems for this year. Removing a problem will delete all its associated file
					records.
				</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3 pt-5">
				{#each problemList as _, i}
					<div class="flex gap-2">
						<input
							name="problemNumber"
							type="text"
							bind:value={problemList[i].number}
							placeholder="T1"
							class="h-9 w-20 shrink-0 rounded-4xl border border-input bg-input/30 px-3 py-1 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
						<input
							name="problemTitle"
							type="text"
							bind:value={problemList[i].title}
							placeholder="Problem title (optional)"
							class="h-9 flex-1 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onclick={() => removeProblem(i)}
						>
							<Trash2 class="size-4" />
						</Button>
					</div>
				{/each}
				<Button type="button" variant="outline" size="sm" onclick={addProblem} class="self-start">
					<Plus class="size-4" /> Add problem
				</Button>
			</Card.Content>
		</Card.Root>

		<Button type="submit" class="self-start">Save metadata</Button>
	</form>

<!-- ══════════════════════════════════════════════════════════════════════
     PHASE 2 — File uploads
     ══════════════════════════════════════════════════════════════════════ -->

{:else}
	<div class="flex flex-col gap-6">

		<!-- Year-level files -->
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Year-level files</Card.Title>
				<Card.Description>Files that cover the whole year rather than a single problem.</Card.Description>
			</Card.Header>
			<Card.Content class="pt-5">
				<div class="flex flex-col gap-4">
					{#each yearFTEntries as [fileType, ft] (fileType)}
						{@const key = uploadKey('year', fileType)}
						{@const existing = data.yearFiles[fileType]}
						<div class="flex flex-col gap-2">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{ft.label}</span>
								{#if existing}
									<Badge variant="outline" href={existing} target="_blank" class="gap-1 text-xs">
										<ExternalLink class="size-3" /> View current
									</Badge>
								{/if}
							</div>
							<div class="flex gap-2">
								<form
									method="POST"
									action="?/uploadFile"
									enctype="multipart/form-data"
									use:enhance={() => {
										uploading[key] = true;
										return async ({ update }) => {
											uploading[key] = false;
											await update();
										};
									}}
									class="flex flex-1 gap-2"
								>
									<input type="hidden" name="scope" value="year" />
									<input type="hidden" name="fileType" value={fileType} />
									<input
										type="file"
										name="file"
										accept=".pdf,.xlsx,.zip,.doc,.docx,.htm,.html"
										required
										class="flex-1 text-sm text-muted-foreground file:mr-3 file:rounded-4xl file:border file:border-border file:bg-card file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
									/>
									<Button type="submit" size="sm" disabled={uploading[key]}>
										{uploading[key] ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
									</Button>
								</form>
								{#if existing}
									<form
										method="POST"
										action="?/deleteFile"
										use:enhance={() => async ({ update }) => update()}
									>
										<input type="hidden" name="scope" value="year" />
										<input type="hidden" name="fileType" value={fileType} />
										<input type="hidden" name="url" value={existing} />
										<Button type="submit" variant="destructive" size="icon-sm">
											<Trash2 class="size-4" />
										</Button>
									</form>
								{/if}
							</div>
						</div>
						<Separator />
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Per-problem files -->
		{#if data.problems.length === 0}
			<p class="text-sm text-muted-foreground">
				No problems defined yet — go to Phase 1 to add them first.
			</p>
		{:else}
			{#each data.problems as problem (problem.id)}
				<Card.Root>
					<Card.Header class="border-b">
						<Card.Title>
							<span class="font-mono text-primary">{problem.number}</span>
							{#if problem.title}
								<span class="ml-2 font-normal text-muted-foreground">{problem.title}</span>
							{/if}
						</Card.Title>
					</Card.Header>
					<Card.Content class="pt-5">
						<div class="flex flex-col gap-4">
							{#each probFTEntries as [fileType, ft] (fileType)}
								{@const key = uploadKey('problem', fileType, problem.number)}
								{@const existing = problem.files[fileType]}
								<div class="flex flex-col gap-2">
									<div class="flex items-center justify-between">
										<span class="text-sm font-medium">{ft.label}</span>
										{#if existing}
											<Badge variant="outline" href={existing} target="_blank" class="gap-1 text-xs">
												<ExternalLink class="size-3" /> View current
											</Badge>
										{/if}
									</div>
									<div class="flex gap-2">
										<form
											method="POST"
											action="?/uploadFile"
											enctype="multipart/form-data"
											use:enhance={() => {
												uploading[key] = true;
												return async ({ update }) => {
													uploading[key] = false;
													await update();
												};
											}}
											class="flex flex-1 gap-2"
										>
											<input type="hidden" name="scope" value="problem" />
											<input type="hidden" name="fileType" value={fileType} />
											<input type="hidden" name="problemNumber" value={problem.number} />
											<input
												type="file"
												name="file"
												accept=".pdf,.xlsx,.zip,.doc,.docx,.htm,.html"
												required
												class="flex-1 text-sm text-muted-foreground file:mr-3 file:rounded-4xl file:border file:border-border file:bg-card file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground"
											/>
											<Button type="submit" size="sm" disabled={uploading[key]}>
												{uploading[key] ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
											</Button>
										</form>
										{#if existing}
											<form
												method="POST"
												action="?/deleteFile"
												use:enhance={() => async ({ update }) => update()}
											>
												<input type="hidden" name="scope" value="problem" />
												<input type="hidden" name="fileType" value={fileType} />
												<input type="hidden" name="problemNumber" value={problem.number} />
												<input type="hidden" name="url" value={existing} />
												<Button type="submit" variant="destructive" size="icon-sm">
													<Trash2 class="size-4" />
												</Button>
											</form>
										{/if}
									</div>
								</div>
								<Separator />
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		{/if}

	</div>
{/if}
```

---

One thing to note after implementing: **Add a link to `/contribute`** in the navigation — either in `NavLink` entries in `+layout.svelte` or in `AppSidebar.svelte` — so contributors can actually find the page.