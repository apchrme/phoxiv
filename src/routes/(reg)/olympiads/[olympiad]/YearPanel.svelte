<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import FileBadge from '#lib/components/FileBadge.svelte';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { Collapsible } from 'bits-ui';
	import { ChevronRight } from '@lucide/svelte';
	import { page } from '$app/state';
	import { cn } from '#lib/utils.js';
	import { plural } from '#lib/utils/plural.js';
	import type { Pending } from '#lib/forms.svelte.js';
	import { formatScore, progressKey, yearTotals, type ProgressMap } from '#lib/progress.js';
	import ProblemCard from './ProblemCard.svelte';
	import ProblemRow from './ProblemRow.svelte';
	import { hasYearLevelContent, type FilteredYear } from './filter';
	import { isHttpUrl } from '#lib/uploads.js';

	/**
	 * One year: its notes, links and files, then the matching problems. Problems
	 * with files are cards; those without are one-line rows in a section that
	 * starts collapsed. The card `id` is the target for `#2019`-style links from
	 * search.
	 */
	let {
		year,
		showYearLevel,
		narrowed,
		progress,
		pending,
		signedIn
	}: {
		year: FilteredYear;
		/** Whether to show the year's own notes, links and files. */
		showYearLevel: boolean;
		/** A query or filter is set, so the problems without files start open. */
		narrowed: boolean;
		/** The user's progress across the whole olympiad. */
		progress: ProgressMap;
		/** The page's single `Pending`, so each problem's buttons can disable themselves. */
		pending: Pending;
		/** Anonymous visitors see no tracking UI and no totals. */
		signedIn: boolean;
	} = $props();

	/** From `year.problems`, not `matchedProblems`, so filtering doesn't change the totals. */
	const totals = $derived(yearTotals(year.year, year.problems, progress));

	/**
	 * `saveMetadata` refuses non-http(s) links; this drops any stored before it
	 * did, since a `javascript:` href here would run for whoever clicks it.
	 */
	const links = $derived(year.extraLinks.filter((link) => isHttpUrl(link.url)));

	const withFiles = $derived(year.matchedProblems.filter((p) => p.files.length > 0));
	const withoutFiles = $derived(year.matchedProblems.filter((p) => p.files.length === 0));

	/** True when a `#2019` link points at this year. */
	const targeted = $derived(page.url.hash === `#${year.year}`);

	/**
	 * Collapsed unless the list is narrowed or a `#2019` link points here: ⌘K, the
	 * dashboard and badge pages all link to the year, and the problem they mean
	 * may be in this section. A derived the toggle writes to, so the user's choice
	 * holds until one of those changes and resets it.
	 *
	 * Read only booleans here, never `year` or `page.url`. A derived recomputes,
	 * discarding the user's choice, whenever anything it reads changes, and the
	 * page passes a new `year` object every time the progress fetch lands.
	 * `targeted` absorbs those changes: it notifies only when its value flips.
	 */
	let open = $derived(narrowed || targeted);
</script>

<Card.Root id={String(year.year)} class="pt-5 pb-3 sm:py-5">
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
				<!-- Keyed by index: nothing makes notes or link labels unique, and a
				     duplicate key breaks the list. -->
				{#each year.notes as note, i (i)}
					<p class="m-0 text-sm text-muted-foreground">{note}</p>
				{/each}
				{#if links.length > 0 || year.yearFiles.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each links as link, i (i)}
							<FileBadge href={link.url} label={link.label} external />
						{/each}
						{#each year.yearFiles as file (file.label)}
							<FileBadge href={file.url} label={file.label} />
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if withFiles.length > 0}
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each withFiles as problem (problem.number)}
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

		{#if withoutFiles.length > 0}
			<Collapsible.Root bind:open class="flex flex-col">
				<!-- -mx-4 aligns the chevron with the left edge of the files -->
				<Collapsible.Trigger
					class={cn(
						buttonVariants({ variant: 'ghost', size: 'sm' }),
						'-mx-4 w-fit gap-1.5 text-muted-foreground hover:text-foreground bg-transparent!'
					)}
				>
					<ChevronRight
						class={cn(
							'size-4 transition-transform motion-reduce:transition-none',
							open && 'rotate-90'
						)}
					/>
					{plural(withoutFiles.length, 'problem without files', 'problems without files')}
				</Collapsible.Trigger>
				<!-- `hiddenUntilFound`: collapsed rows stay in the DOM, so the browser's
				     find-in-page still reaches a title and opens the section. -->
				<Collapsible.Content hiddenUntilFound>
					<ul class="mt-2 list-none divide-y divide-border/60 rounded-xl bg-muted/50 p-0">
						{#each withoutFiles as problem (problem.number)}
							<ProblemRow
								{problem}
								year={year.year}
								entry={progress[progressKey(year.year, problem.number)]}
								{pending}
								{signedIn}
							/>
						{/each}
					</ul>
				</Collapsible.Content>
			</Collapsible.Root>
		{/if}
	</div>
</Card.Root>
