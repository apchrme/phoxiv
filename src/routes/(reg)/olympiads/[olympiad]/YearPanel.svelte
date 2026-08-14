<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import FileBadge from '$lib/components/FileBadge.svelte';
	import ProblemCard from './ProblemCard.svelte';
	import { hasYearLevelContent, type FilteredYear } from './filter';

	/**
	 * One year of an olympiad: its notes, links and year-level files, then a grid
	 * of the problems that matched the current filter.
	 *
	 * The `id` on the card is the anchor target used by the global search and by
	 * `#2019`-style deep links.
	 */
	let {
		year,
		showYearLevel
	}: {
		year: FilteredYear;
		/** Whether the year's own notes/links/files should be shown. */
		showYearLevel: boolean;
	} = $props();
</script>

<Card.Root id={String(year.year)}>
	<Card.Header>
		<Card.Title class="font-mono text-lg font-semibold text-foreground tabular-nums">
			{year.year}
		</Card.Title>
	</Card.Header>

	<Separator />

	<div class="flex flex-col gap-4 px-3 sm:px-5">
		{#if showYearLevel && hasYearLevelContent(year)}
			<div class="flex flex-col gap-2">
				{#each year.notes as note (note)}
					<p class="m-0 text-sm text-muted-foreground">{note}</p>
				{/each}
				{#if year.extraLinks.length > 0 || year.yearFiles.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each year.extraLinks as link (link.label)}
							<FileBadge href={link.url} label={link.label} external />
						{/each}
						{#each year.yearFiles as file (file.label)}
							<FileBadge
								href={file.url}
								label={file.label}
								class="px-2.5 py-2.5 text-sm hover:border-primary/40 dark:hover:border-primary/30"
							/>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if year.matchedProblems.length > 0}
			<div class="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
				{#each year.matchedProblems as problem (problem.number)}
					<ProblemCard {problem} />
				{/each}
			</div>
		{/if}
	</div>
</Card.Root>
