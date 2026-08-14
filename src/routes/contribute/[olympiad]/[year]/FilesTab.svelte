<script lang="ts">
	import type { PageData } from './$types';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import FileSection from './FileSection.svelte';

	/**
	 * Phase 2 of the year editor: one upload section for the year itself, then one
	 * per problem.
	 *
	 * Reads the loaded problem list rather than the metadata tab's draft — a
	 * problem has to exist in the database before a file can be attached to it,
	 * which is what the "go to Phase 1 first" note below is about.
	 */
	let {
		yearFiles,
		problems,
		pending
	}: {
		yearFiles: PageData['yearFiles'];
		problems: PageData['problems'];
		/** The page's single tracker, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();
</script>

<div class="flex flex-col gap-5">
	<!-- Year-level files -->
	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Year-level files</Card.Title>
			<Card.Description>
				Files that cover the whole year rather than a single problem.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<FileSection scope="year" existingFiles={yearFiles} {pending} />
		</Card.Content>
	</Card.Root>

	<!-- Per-problem files -->
	{#if problems.length === 0}
		<p class="text-sm text-muted-foreground">
			No problems defined yet — go to Phase 1 to add them first.
		</p>
	{:else}
		{#each problems as problem (problem.id)}
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
					<FileSection
						scope="problem"
						existingFiles={problem.files}
						problemNumber={problem.number}
						{pending}
					/>
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</div>
