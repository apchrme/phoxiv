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

    let notes = $derived<string[]>([...data.year.notes]);
    let extraLinks = $derived<{ label: string; url: string }[]>([...data.year.extraLinks]);
    let problemList = $derived<{ number: string; title: string }[]>(
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
				{#each notes as note, i (note)}
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
				{#each extraLinks as extraLink, i (extraLink.label)}
					<div class="flex gap-2">
						<input
							name="linkLabel"
							type="text"
							bind:value={extraLink.label}
							placeholder="Label"
							class="h-9 w-32 shrink-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
						<input
							name="linkUrl"
							type="url"
							bind:value={extraLink.url}
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
				{#each problemList as problem, i (problem.number)}
					<div class="flex gap-2">
						<input
							name="problemNumber"
							type="text"
							bind:value={problem.number}
							placeholder="T1"
							class="h-9 w-20 shrink-0 rounded-4xl border border-input bg-input/30 px-3 py-1 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
						<input
							name="problemTitle"
							type="text"
							bind:value={problem.title}
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