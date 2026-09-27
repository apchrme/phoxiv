<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import FileBadge from '$lib/components/FileBadge.svelte';
	import type { Pending } from '$lib/forms.svelte';
	import { formatScore, progressKey, yearTotals, type ProgressMap } from '$lib/progress';
	import ProblemCard from './ProblemCard.svelte';
	import { hasYearLevelContent, type FilteredYear } from './filter';

	/**
	 * One year: its notes, links and files, then the matching problems. The card
	 * `id` is the target for `#2019`-style links from search.
	 */
	let {
		year,
		showYearLevel,
		progress,
		pending,
		signedIn
	}: {
		year: FilteredYear;
		/** Whether to show the year's own notes, links and files. */
		showYearLevel: boolean;
		/** The user's progress across the whole olympiad. */
		progress: ProgressMap;
		/** The page's single `Pending`, so each problem's buttons can disable themselves. */
		pending: Pending;
		/** Anonymous visitors see no tracking UI and no totals. */
		signedIn: boolean;
	} = $props();

	/** From `year.problems`, not `matchedProblems`, so filtering doesn't change the totals. */
	const totals = $derived(yearTotals(year.year, year.problems, progress));
</script>

<Card.Root id={String(year.year)}>
	<Card.Header class="border-b">
		<Card.Title class="font-mono text-lg font-semibold text-foreground tabular-nums">
			{year.year}
		</Card.Title>
		{#if signedIn && totals.completed > 0}
			<!-- The card header lays out a `Card.Action` top-right by itself. -->
			<Card.Action class="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5">
				<span class="text-sm text-muted-foreground tabular-nums">
					{totals.completed}/{totals.total} done
				</span>
				{#if totals.maxScore > 0}
					<span class="font-mono text-sm font-semibold text-primary tabular-nums">
						{formatScore(totals.score)} / {formatScore(totals.maxScore)}
					</span>
				{/if}
				{#if totals.unscaled > 0}
					<span
						class="text-xs text-muted-foreground"
						title="Scored, but with no maximum score set — so they can't be counted in the ratio."
					>
						+{totals.unscaled} unscaled
					</span>
				{/if}
			</Card.Action>
		{/if}
	</Card.Header>

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
							<FileBadge href={file.url} label={file.label} />
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if year.matchedProblems.length > 0}
			<div class="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
				{#each year.matchedProblems as problem (problem.number)}
					<ProblemCard
						{problem}
						year={year.year}
						entry={progress[progressKey(year.year, problem.number)]}
						{pending}
						{signedIn}
					/>
				{/each}
			</div>
		{/if}
	</div>
</Card.Root>
