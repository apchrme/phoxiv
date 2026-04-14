<script lang="ts">
	import type { PageProps } from './$types';
	let { params }: PageProps = $props();
	import contests from '$lib/pregen/contests.json';
	import SvelteSeo from 'svelte-seo';

	import files from '$lib/pregen/files.json';
	import type { YearEntry } from '$lib/pregen/types.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchEmptyState from '$lib/components/SearchEmptyState.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';

	// contest will definitely be found, as the page.ts will throw a 404 if it isn't.
	let contest = $derived(contests.find((i) => i.id == params.contest));
	const contestFiles: YearEntry[] = $derived(
		(files as unknown as Record<string, YearEntry[]>)[contest.id] ?? []
	);

	// Merged file type labels for this specific contest
	const yearFTEntries = $derived(Object.entries(contest?.yearFileTypes ?? {}));
	const probFTEntries = $derived(Object.entries(contest?.problemFileTypes ?? {}));

	let query = $state('');
	let showFullYear = $state(false);

	const filtered = $derived(() => {
		const q = query.trim().toLowerCase();
		if (!q) return contestFiles.map((y) => ({ ...y, matchedProblems: y.problems }));

		const results = [];
		for (const year of contestFiles) {
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
		return contestFiles.some(
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
	title={contest.name}
	description="An archive of problems and solutions from the {contest.name}, in PDF format."
	keywords="problems, solutions, olympiad, physics"
/>

<h1>{contest.name}</h1>

{#if contest?.descriptionHtml}
	<div class="mb-4 max-w-none">
		{@html contest.descriptionHtml}
	</div>
{/if}

<section class="my-4">
	<div class="mb-4">
		<SearchBar placeholder="Search by year or problem…" bind:value={query}>
			{#snippet filters()}
				{#if hasProblemMatches()}
					<label class="flex cursor-pointer items-center gap-2">
						<Switch bind:checked={showFullYear} />
						<span class="text-sm font-medium text-muted-foreground">Show full year</span>
					</label>
				{/if}
			{/snippet}
		</SearchBar>
	</div>

	{#if filtered().length > 0}
		<div class="flex flex-col gap-4">
			{#each filtered() as year (year.year)}
				<div class="overflow-hidden rounded-2xl border border-border bg-card">
					<div class="flex items-center border-b border-border bg-muted/60 px-4 py-2.5">
						<span class="font-mono text-lg font-semibold text-foreground tabular-nums">
							{year.year}
						</span>
					</div>

					<div class="flex flex-col gap-4 p-4">

						{#snippet FileLink(url:string, label:string)}
							<Badge variant="outline" href={url} target="_blank" class="text-sm px-2.5 py-2.5">
								{label}
							</Badge>
						{/snippet}

						{#if showYearLevel(year) && hasYearLevelContent(year)}
							<div class="flex flex-col gap-2">
								{#each year.notes as note (note)}
									<p class="text-xs text-muted-foreground m-0">{note}</p>
								{/each}
								{#if year.extraLinks.length > 0 || Object.keys(year.yearFiles).length > 0}
									<div class="flex flex-wrap gap-2">
										{#each year.extraLinks as link (link.label)}
											{@render FileLink(link.url, link.label)}
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
