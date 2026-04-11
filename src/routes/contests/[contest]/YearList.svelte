<script lang="ts">
	const { contestId }: { contestId: string } = $props();
	import files from '$lib/pregen/files.json';
	import contestsData from '$lib/pregen/contests.json';
	import type { YearEntry, ContestEntry } from '$lib/pregen/types.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchEmptyState from '$lib/components/SearchEmptyState.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';

	const contestFiles: YearEntry[] = $derived(
		(files as unknown as Record<string, YearEntry[]>)[contestId] ?? []
	);

	// Merged file type labels for this specific contest
	const contest = $derived(
		(contestsData as unknown as ContestEntry[]).find((c) => c.id === contestId)
	);
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
						{#if showYearLevel(year) && hasYearLevelContent(year)}
							<div class="flex flex-col gap-2">
								{#each year.notes as note (note)}
									<p class="text-xs text-muted-foreground">{note}</p>
								{/each}
								{#if year.extraLinks.length > 0 || Object.keys(year.yearFiles).length > 0}
									<div class="flex flex-wrap gap-2">
										{#each year.extraLinks as link (link.label)}
											<Badge variant="outline" href={link.url} target="_blank">
												{link.label}
											</Badge>
										{/each}
										{#each yearFTEntries as [key, ft] (key)}
											{#if year.yearFiles[key]}
												<Badge variant="outline" href={year.yearFiles[key]} target="_blank">
													{ft.label}
												</Badge>
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
											<span class="font-mono text-sm font-semibold text-primary">
												{problem.number}
											</span>
											{#if problem.title}
												<span class="text-sm leading-snug font-medium text-foreground">
													{problem.title}
												</span>
											{/if}
										</div>
										<div class="flex flex-wrap gap-1.5">
											{#each probFTEntries as [key, ft] (key)}
												{#if problem.files[key]}
													<Badge variant="outline" href={problem.files[key]} target="_blank">
														{ft.label}
													</Badge>
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
