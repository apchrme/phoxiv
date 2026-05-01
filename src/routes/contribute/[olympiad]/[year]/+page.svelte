<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { ChevronLeft, Plus, Trash2, ExternalLink } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';

	let { data, form }: PageProps = $props();

	let phase = $state<'metadata' | 'files'>('metadata');
	// Map existing data to objects with unique IDs
	// We need to use deep state here because the page data is just used to seed the variables, and subsequent updates are by the user.
	// svelte-ignore state_referenced_locally
	let notes = $state(data.year.notes.map(n => ({ id: crypto.randomUUID(), value: n })));
	
	// svelte-ignore state_referenced_locally
	let extraLinks = $state(data.year.extraLinks.map(l => ({ 
		id: crypto.randomUUID(), 
		label: l.label, 
		url: l.url 
	})));

	// svelte-ignore state_referenced_locally
	let problemList = $state(data.problems.map(p => ({ 
		id: crypto.randomUUID(), 
		number: p.number, 
		title: p.title ?? '' 
	})));

	// Helper to add new entries with fresh IDs
	function addNote() {
		notes.push({ id: crypto.randomUUID(), value: '' });
	}
	
	function addLink() {
		extraLinks.push({ id: crypto.randomUUID(), label: '', url: '' });
	}
	
	function addProblem() {
		problemList.push({ id: crypto.randomUUID(), number: '', title: '' });
	}
	// Remove functions remain simple (can use index or ID)
	
	function removeNote(i: number) { notes.splice(i, 1); }
	function removeLink(i: number) { extraLinks.splice(i, 1); }
	function removeProblem(i: number) { problemList.splice(i, 1); }
	let savingMetadata = $state(false);
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

	const yearFTEntries = $derived(Object.entries(data.olympiad.yearFileTypes));
	const probFTEntries = $derived(Object.entries(data.olympiad.problemFileTypes));

	function uploadKey(scope: 'year' | 'problem', fileType: string, problemNumber?: string) {
		return scope === 'year' ? `year__${fileType}` : `${problemNumber}__${fileType}`;
	}
</script>

<a
	href={resolve('/contribute')}
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
		Editing <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs"
			>{data.olympiad.id}/{data.year.year}</code
		>
	</p>
</header>

<Tabs.Root bind:value={phase} class="gap-5">
	<Tabs.List>
		<Tabs.Trigger value="metadata">Phase 1 — Metadata</Tabs.Trigger>
		<Tabs.Trigger value="files">Phase 2 — Files</Tabs.Trigger>
	</Tabs.List>

	<Tabs.Content value="metadata">
			<form 
				method="POST" 
				action="?/saveMetadata" 
				use:enhance={() => {
					savingMetadata = true;
					return async ({ update }) => {
						// update() normally invalidates data and resets the form. 
						// We pass { reset: false } to keep the user's input intact.
						savingMetadata = false;
						await update({ reset: false });
					};
				}} 
				class="flex flex-col gap-5"
			>
			<!-- Notes -->
			<Card.Root>
				<Card.Header class="border-b">
					<Card.Title>Notes</Card.Title>
					<Card.Description>
						Short notices shown above the file links for this year.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3">
					{#each notes as note, i (note.id)}
						<div class="flex gap-2">
							<input
								name="note"
								type="text"
								bind:value={note.value}
								placeholder="e.g. Solutions are unofficial"
								class="h-9 flex-1 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
							<Button type="button" variant="ghost" size="icon-sm" onclick={() => removeNote(i)}>
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
				<Card.Content class="flex flex-col gap-3">
					{#each extraLinks as extraLink, i (extraLink.id)}
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
							<Button type="button" variant="ghost" size="icon-sm" onclick={() => removeLink(i)}>
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
						Define the problems for this year. Removing a problem will delete all its associated
						file records.
					</Card.Description>
				</Card.Header>
				<Card.Content class="flex flex-col gap-3">
					{#each problemList as problem, i (problem.id)}
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
							<Button type="button" variant="ghost" size="icon" onclick={() => removeProblem(i)}>
								<Trash2 class="size-4" />
							</Button>
						</div>
					{/each}
					<Button type="button" variant="outline" size="sm" onclick={addProblem} class="self-start">
						<Plus class="size-4" /> Add problem
					</Button>
				</Card.Content>
			</Card.Root>

			<div class="flex flex-row items-center gap-2">
			<Button type="submit" class="disabled:bg-primary/60" disabled={savingMetadata}>
				Save metadata
			</Button>
			{#if savingMetadata}
      			<Spinner class="size-5"/>
			{/if}

			</div>

		</form>
	</Tabs.Content>

	<Tabs.Content value="files">
		<div class="flex flex-col gap-5">
			{#snippet fileTypeList(scope: "year"|"problem", fileTypeEntries: [string, {label: string}][], files: Record<string, string>,  problemNumber?: string)}
				<div class="flex flex-col gap-4">
					{#each fileTypeEntries as [fileType, ft], i (fileType)}
						{@const key = uploadKey(scope, fileType, problemNumber)}
						{@const existing = files[fileType]}
						<div class="flex flex-col gap-2">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium">{ft.label}</span>
								{#if existing}
									<Badge
										variant="outline"
										href={existing}
										target="_blank"
										class="p-2.5 text-sm"
									>
										<ExternalLink class="size-3" /> View current
									</Badge>
								{/if}
							</div>
							<div class="flex items-end gap-2">
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
									class="flex flex-col md:flex-row flex-1 gap-2"
								>
									<input type="hidden" name="scope" value={scope} />
									<input type="hidden" name="fileType" value={fileType} />
									{#if problemNumber}
										<input type="hidden" name="problemNumber" value={problemNumber} />
									{/if}
									<input
										type="file"
										name="file"
										accept=".pdf,.xlsx,.zip,.doc,.docx,.htm,.html"
										required
										class="flex-1 text-sm text-muted-foreground file:mr-3 file:rounded-4xl file:border file:border-border file:bg-card file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground"
									/>
									<Button type="submit" disabled={uploading[key]}>
										{uploading[key] ? 'Uploading…' : existing ? 'Replace' : 'Upload'}
									</Button>
								</form>
								{#if existing}
									<form
										method="POST"
										action="?/deleteFile"
									>
										<input type="hidden" name="scope" value={scope} />
										<input type="hidden" name="fileType" value={fileType} />
										{#if problemNumber}
											<input type="hidden" name="problemNumber" value={problemNumber} />
										{/if}
										<input type="hidden" name="url" value={existing} />
										<Button type="submit" variant="destructive" size="icon">
											<Trash2 class="size-4" />
										</Button>
									</form>
								{/if}
							</div>
						</div>
						{#if i < fileTypeEntries.length-1}
							<Separator />
						{/if}
					{/each}
				</div>
			{/snippet}

			<!-- Year-level files -->
			<Card.Root>
				<Card.Header class="border-b">
					<Card.Title>Year-level files</Card.Title>
					<Card.Description
						>Files that cover the whole year rather than a single problem.</Card.Description
					>
				</Card.Header>

				<Card.Content>
					{@render fileTypeList("year", yearFTEntries, data.yearFiles)}
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

						<Card.Content>

							{@render fileTypeList("problem", probFTEntries, problem.files, problem.number)}
						</Card.Content>
					</Card.Root>
				{/each}
			{/if}
		</div>
	</Tabs.Content>
</Tabs.Root>
