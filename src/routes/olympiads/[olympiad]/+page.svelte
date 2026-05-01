<script lang="ts">
	import type { PageProps } from './$types';
	import type { YearEntry } from '$lib/types.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchEmptyState from '$lib/components/SearchEmptyState.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { ChevronLeft, ExternalLink } from '@lucide/svelte';
	import SvelteSeo from 'svelte-seo';

	let { data }: PageProps = $props();

	let olympiad = $derived(data.olympiad);
	let olympiadFiles = $derived(data.olympiadFiles as YearEntry[]);

	const yearFTEntries = $derived(Object.entries(olympiad.yearFileTypes));
	const probFTEntries = $derived(Object.entries(olympiad.problemFileTypes));

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
		return (
			Object.keys(year.yearFiles).length > 0 || year.notes.length > 0 || year.extraLinks.length > 0
		);
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
	<div class="mb-4">
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

	{#if filtered().length > 0}
		<div class="flex flex-col gap-4">
			{#each filtered() as year (year.year)}
				<div
					class="overflow-hidden rounded-2xl border border-border bg-card"
					id={String(year.year)}
				>
					<div class="flex items-center border-b border-border bg-muted/60 px-4 py-2.5">
						<span class="font-mono text-lg font-semibold text-foreground tabular-nums">
							{year.year}
						</span>
					</div>

					<div class="flex flex-col gap-4 p-4">
						{#snippet FileLink(url: string, label: string)}
							<Badge variant="outline" href={url} target="_blank" class="px-2.5 py-2.5 text-sm">
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
								{#if year.extraLinks.length > 0 || Object.keys(year.yearFiles).length > 0}
									<div class="flex flex-wrap gap-2">
										{#each year.extraLinks as link (link.label)}
											{@render ExtraFileLink(link.url, link.label)}
										{/each}
										{#each yearFTEntries as [key, ft] (key)}
											{#if year.yearFiles[key]}
												{@render FileLink(year.yearFiles[key], ft.label)}
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/if}

						{#if year.matchedProblems.length > 0}
							<div class="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
								{#each year.matchedProblems as problem (problem.number)}
									<div class="flex flex-col gap-3 rounded-xl bg-background p-4">
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
											{#each probFTEntries as [key, ft] (key)}
												{#if problem.files[key]}
													{@render FileLink(problem.files[key], ft.label)}
												{/if}
											{/each}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
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
