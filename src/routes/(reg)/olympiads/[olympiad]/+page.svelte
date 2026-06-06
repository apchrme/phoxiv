<script lang="ts">
	import type { PageProps } from './$types';
	import type { YearEntry } from '$lib/types.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchEmptyState from '$lib/components/SearchEmptyState.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { ChevronLeft, ExternalLink } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import SvelteSeo from 'svelte-seo';
	import { onMount, tick } from 'svelte';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';

	let { data }: PageProps = $props();

	let olympiad = $derived(data.olympiad);
	let olympiadFiles: YearEntry[] | null = $state(null);
	let olympiadFilesLoading = $state(true);

	$effect(() => {
    const id = olympiad.id; // tracked dependency
    olympiadFiles = null;
    olympiadFilesLoading = true;
    query = '';

    fetch(`/api/olympiads/${id}`)
        .then((r) => r.json())
        .then(async (data) => {
            olympiadFiles = data;
            olympiadFilesLoading = false;

            const hash = window.location.hash;
            if (hash) {
                await tick();
                document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
            }
        });
});

	let query = $state('');
	let showFullYear = $state(false);

	const filtered = $derived(() => {
		const q = query.trim().toLowerCase();
		if (!q) return olympiadFiles.map((y) => ({ ...y, matchedProblems: y.problems }));

		const results = [];
		for (const year of olympiadFiles) {
			const yearMatches = String(year.year).includes(q);
			const matchedProblems = year.problems.filter(
				(p) => p.number.toLowerCase().includes(q) || (p.title?.toLowerCase().includes(q) ?? false)
			);
			if (yearMatches) {
				results.push({ ...year, matchedProblems: year.problems });
			} else if (matchedProblems.length > 0) {
				results.push({ ...year, matchedProblems: showFullYear ? year.problems : matchedProblems });
			}
		}
		return results;
	});

	const hasProblemMatches = $derived(() => {
		const q = query.trim().toLowerCase();
		if (!q) return false;
		return olympiadFiles.some(
			(y) =>
				!String(y.year).includes(q) &&
				y.problems.some(
					(p) => p.number.toLowerCase().includes(q) || (p.title?.toLowerCase().includes(q) ?? false)
				)
		);
	});

	function showYearLevel(year: (typeof filtered extends () => infer R ? R : never)[number]) {
		const q = query.trim().toLowerCase();
		return !q || String(year.year).includes(q) || showFullYear;
	}

	function hasYearLevelContent(year: YearEntry) {
		return year.yearFiles.length > 0 || year.notes.length > 0 || year.extraLinks.length > 0;
	}
</script>

<SvelteSeo
	title={olympiad.name}
	description="An archive of problems and solutions from the {olympiad.name}, in PDF format."
	keywords="problems, solutions, olympiad, physics"
/>

<a
	href="/olympiads"
	class="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-primary"
>
	<ChevronLeft class="size-4" />
	Back to olympiads
</a>

<header class="flex flex-col gap-3 pt-3 md:pt-5">
	<h1 class="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">{olympiad.name}</h1>
	{#if olympiad?.descriptionHtml}
		<div class="prose mb-4 max-w-none">
			{@html olympiad.descriptionHtml}
		</div>
	{/if}
</header>

<section class="py-4">
	<div class="mb-5">
		<SearchBar placeholder="Search by year or problem…" bind:value={query}>
			{#snippet filters()}
				{#if hasProblemMatches()}
					<label class="flex cursor-pointer items-center gap-2">
						<Switch bind:checked={showFullYear} />
						<span class="text-sm text-nowrap text-muted-foreground">Show full year</span>
					</label>
				{/if}
			{/snippet}
		</SearchBar>
	</div>
	{#if olympiadFilesLoading}
		<div class="flex flex-col gap-4">
			<Skeleton class="h-50 w-full" />
			<Skeleton class="h-50 w-full" />
			<Skeleton class="h-50 w-full" />
			<Skeleton class="h-50 w-full" />
		</div>
	{:else if filtered().length > 0}
		<div class="flex flex-col gap-4">
			{#each filtered() as year (year.year)}
				<!-- Glass year panel -->
				<Card.Root id={String(year.year)}>
					<!-- Year header -->
					<Card.Header>
						<Card.Title class="font-mono text-lg font-semibold text-foreground tabular-nums">
							{year.year}
						</Card.Title>
					</Card.Header>

					<Separator />

					<div class="flex flex-col gap-4 px-3 sm:px-5">
						{#snippet FileLink(url: string, label: string)}
							<Badge
								variant="outline"
								href={url}
								target="_blank"
								class="px-2.5 py-2.5 text-sm hover:border-primary/40 dark:hover:border-primary/30"
							>
								{label}
							</Badge>
						{/snippet}

						{#snippet ExtraFileLink(url: string, label: string)}
							<Badge variant="outline" href={url} target="_blank" class="px-2.5 py-2.5 text-sm">
								<ExternalLink />
								{label}
							</Badge>
						{/snippet}

						{#if showYearLevel(year) && hasYearLevelContent(year)}
							<div class="flex flex-col gap-2">
								{#each year.notes as note (note)}
									<p class="m-0 text-sm text-muted-foreground">{note}</p>
								{/each}
								{#if year.extraLinks.length > 0 || year.yearFiles.length > 0}
									<div class="flex flex-wrap gap-2">
										{#each year.extraLinks as link (link.label)}
											{@render ExtraFileLink(link.url, link.label)}
										{/each}
										{#each year.yearFiles as file (file.label)}
											{@render FileLink(file.url, file.label)}
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						{#if year.matchedProblems.length > 0}
							<div class="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
								{#each year.matchedProblems as problem (problem.number)}
									<div class="flex flex-col gap-2 p-5 rounded-xl bg-muted/50">
										<div class="flex flex-col gap-0.5">
											<span class="font-mono text-base font-semibold text-primary">
												{problem.number}
											</span>
											{#if problem.title}
												<span class="text-base leading-snug font-medium text-foreground">
													{problem.title}
												</span>
											{/if}
										</div>
										<div class="flex flex-wrap gap-2">
											{#each problem.files as file (file.label)}
												{@render FileLink(file.url, file.label)}
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</Card.Root>
			{/each}
		</div>
	{:else}
		<SearchEmptyState
			message="No results found"
			hint="Try a different year or problem name."
			onClear={() => {
				query = '';
			}}
		/>
	{/if}
</section>
